#!/usr/bin/env python3
"""
CryptPad Backup Decryption Tool

This tool decrypts backup files from the CryptPad application.
It can process files containing ENC<...> encrypted strings and decrypt them
using the same AES-GCM encryption algorithm as the web application.

Usage:
    python decrypt_backup.py <backup_file> --key <encryption_key>
    python decrypt_backup.py <backup_file> --key <encryption_key> --output <output_file>

Example:
    python decrypt_backup.py backup/qkjf/qkjf_20250518141635.md --key "mypassword"
"""

import argparse
import base64
import json
import hashlib
import re
import sys
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    print("Error: cryptography library not found.")
    print("Please install it with: pip install cryptography")
    sys.exit(1)


def derive_key(password: str) -> bytes:
    """
    Derive AES-GCM key from password using SHA-256.
    This matches the key derivation used in the web application.
    """
    return hashlib.sha256(password.encode('utf-8')).digest()


def decrypt_enc_string(enc_string: str, key: bytes) -> str:
    """
    Decrypt a single ENC<...> string.
    
    Args:
        enc_string: The encrypted string in format ENC<base64_json>
        key: The derived AES key (32 bytes)
        
    Returns:
        Decrypted plaintext string
        
    Raises:
        ValueError: If decryption fails or format is invalid
    """
    # Validate format
    if not enc_string.startswith('ENC<') or not enc_string.endswith('>'):
        raise ValueError(f"Invalid ENC format: {enc_string[:50]}...")
    
    # Extract base64 data
    base64_data = enc_string[4:-1]  # Remove ENC< and >
    
    try:
        # Decode base64 and parse JSON
        encrypted_data = json.loads(base64.b64decode(base64_data).decode('utf-8'))
        
        # Extract IV and ciphertext
        iv = bytes(encrypted_data['iv'])
        ciphertext = bytes(encrypted_data['ciphertext'])
        
        # Decrypt using AES-GCM
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(iv, ciphertext, None)
        
        return plaintext.decode('utf-8')
        
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        raise ValueError(f"Failed to decrypt ENC string: {e}")


def process_file(file_path: Path, encryption_key: str) -> str:
    """
    Process a backup file and decrypt all ENC<...> strings.
    
    Args:
        file_path: Path to the backup file
        encryption_key: The encryption password
        
    Returns:
        File content with all encrypted strings decrypted
    """
    # Derive key from password
    key = derive_key(encryption_key)
    
    # Read file content
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except IOError as e:
        raise IOError(f"Failed to read file {file_path}: {e}")
    
    # Find all ENC<...> patterns
    enc_pattern = re.compile(r'ENC<[^>]+>')
    matches = enc_pattern.findall(content)
    
    if not matches:
        print(f"No encrypted content found in {file_path}")
        return content
    
    print(f"Found {len(matches)} encrypted sections in {file_path}")
    
    # Decrypt each ENC string
    decrypted_content = content
    decryption_count = 0
    
    for enc_string in matches:
        try:
            decrypted_text = decrypt_enc_string(enc_string, key)
            decrypted_content = decrypted_content.replace(enc_string, decrypted_text)
            decryption_count += 1
            print(f"  ✓ Decrypted section {decryption_count}")
        except ValueError as e:
            print(f"  ✗ Failed to decrypt section: {e}")
            # Keep the original ENC string in the output
    
    print(f"Successfully decrypted {decryption_count}/{len(matches)} sections")
    return decrypted_content


def main():
    parser = argparse.ArgumentParser(
        description="Decrypt CryptPad backup files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s backup/qkjf/qkjf_20250518141635.md --key "mypassword"
  %(prog)s backup/qkjf/qkjf_20250518141635.md --key "mypassword" --output decrypted.txt
        """
    )
    
    parser.add_argument(
        'file',
        type=Path,
        help='Path to the backup file to decrypt'
    )
    
    parser.add_argument(
        '--key', '-k',
        required=True,
        help='Encryption key/password used to encrypt the content'
    )
    
    parser.add_argument(
        '--output', '-o',
        type=Path,
        help='Output file path (if not specified, prints to stdout)'
    )
    
    args = parser.parse_args()
    
    # Validate input file
    if not args.file.exists():
        print(f"Error: File {args.file} does not exist")
        sys.exit(1)
    
    if not args.file.is_file():
        print(f"Error: {args.file} is not a file")
        sys.exit(1)
    
    try:
        # Process the file
        print(f"Processing: {args.file}")
        decrypted_content = process_file(args.file, args.key)
        
        # Output results
        if args.output:
            # Write to output file
            try:
                with open(args.output, 'w', encoding='utf-8') as f:
                    f.write(decrypted_content)
                print(f"Decrypted content saved to: {args.output}")
            except IOError as e:
                print(f"Error writing to output file: {e}")
                sys.exit(1)
        else:
            # Print to stdout
            print("\n" + "="*50)
            print("DECRYPTED CONTENT:")
            print("="*50)
            print(decrypted_content)
            
    except (IOError, ValueError) as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()