#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sdk_root="${ANDROID_HOME:-$HOME/Android/Sdk}"
signing_dir="${LAX_SIGNING_DIR:-$HOME/Android/Keys}"
keystore="$signing_dir/project-lax-release.jks"
password_file="$signing_dir/project-lax-release.pass"
key_password_file="$signing_dir/project-lax-key.pass"
build_tools="$sdk_root/build-tools/36.0.0"
unsigned_apk="$repo_root/android/app/build/outputs/apk/release/app-release-unsigned.apk"
aligned_apk="$repo_root/android/app/build/outputs/apk/release/app-release-aligned.apk"
final_apk="$repo_root/submission/Project-LAX-Android-v1.6.apk"

for required in "$keystore" "$password_file" "$key_password_file" "$build_tools/zipalign" "$build_tools/apksigner"; do
  if [[ ! -e "$required" ]]; then
    echo "Missing required signing file or tool: $required" >&2
    exit 1
  fi
done

cd "$repo_root"
mkdir -p "$repo_root/submission"
npm run build:android
(cd android && ./gradlew assembleRelease)
"$build_tools/zipalign" -f -p 4 "$unsigned_apk" "$aligned_apk"
"$build_tools/apksigner" sign \
  --ks "$keystore" \
  --ks-key-alias project-lax \
  --ks-pass "file:$password_file" \
  --key-pass "file:$key_password_file" \
  --v4-signing-enabled false \
  --out "$final_apk" "$aligned_apk"
"$build_tools/apksigner" verify --verbose "$final_apk"
sha256sum "$final_apk"
