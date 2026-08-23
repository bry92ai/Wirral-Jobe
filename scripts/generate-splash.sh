#!/usr/bin/env bash
set -e
LOGO="/Users/user/Downloads/36090.jpg"
BASE="/Users/user/CascadeProjects/WirralJobe-handover/android/app/src/main/res"

# landscape: dir width height
for spec in "drawable-land-mdpi 480 320" "drawable-land-hdpi 800 480" "drawable-land-xhdpi 1280 720" "drawable-land-xxhdpi 1600 960" "drawable-land-xxxhdpi 1920 1280"; do
  read -r dir W H <<< "$spec"
  max=$(( W < H ? W : H ))
  sips -s format png "$LOGO" --resampleHeightWidthMax "$max" --padToHeightWidth "$H" "$W" --padColor 000000 --out "$BASE/$dir/splash.png"
  echo "generated $dir/splash.png"
done

# portrait
for spec in "drawable-port-mdpi 320 480" "drawable-port-hdpi 480 800" "drawable-port-xhdpi 720 1280" "drawable-port-xxhdpi 960 1600" "drawable-port-xxxhdpi 1280 1920"; do
  read -r dir W H <<< "$spec"
  max=$(( W < H ? W : H ))
  sips -s format png "$LOGO" --resampleHeightWidthMax "$max" --padToHeightWidth "$H" "$W" --padColor 000000 --out "$BASE/$dir/splash.png"
  echo "generated $dir/splash.png"
done

# base drawable (same dimensions as land-mdpi)
sips -s format png "$LOGO" --resampleHeightWidthMax 320 --padToHeightWidth 320 480 --padColor 000000 --out "$BASE/drawable/splash.png"
echo "generated drawable/splash.png"
