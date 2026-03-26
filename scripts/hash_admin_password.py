#!/usr/bin/env python3
"""Print a bcrypt hash compatible with the admin API (passlib). Use for SQL password resets.

  pip install 'passlib[bcrypt]'   # once on the machine
  python scripts/hash_admin_password.py 'NewPassword'

Then: UPDATE users SET password_hash = '<output>' WHERE email = 'admin@protrader.com';
"""
import sys

try:
    from passlib.context import CryptContext
except ImportError:
    print("Install: pip install passlib[bcrypt]", file=sys.stderr)
    sys.exit(1)

if len(sys.argv) != 2:
    print("Usage: python hash_admin_password.py 'YourPassword'", file=sys.stderr)
    sys.exit(1)

pwd = sys.argv[1]
c = CryptContext(schemes=["bcrypt"], deprecated="auto")
print(c.hash(pwd))
