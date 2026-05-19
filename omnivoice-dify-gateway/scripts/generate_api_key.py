#!/usr/bin/env python3
import secrets


def main() -> None:
    print(f"VOICE_GATEWAY_API_KEY={secrets.token_urlsafe(32)}")


if __name__ == "__main__":
    main()

