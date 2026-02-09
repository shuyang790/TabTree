#!/usr/bin/env bash
set -euo pipefail

CONCEPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREVIEW_DIR="$CONCEPT_DIR/preview"
CHECK_SCRIPT="$CONCEPT_DIR/check-contrast.js"

if ! command -v magick >/dev/null 2>&1; then
  echo "error: ImageMagick 'magick' is required" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "error: Node.js is required" >&2
  exit 1
fi

sizes=(16 32 48 128)
variants=(
  "option2-stacked-tabs|transparent|icon-option2-transparent.svg|Option 2\nTransparent"
)

for entry in "${variants[@]}"; do
  IFS='|' read -r option variant svg_name _label <<<"$entry"
  svg_path="$CONCEPT_DIR/$option/$svg_name"
  out_dir="$CONCEPT_DIR/$option/$variant"
  mkdir -p "$out_dir"

  for size in "${sizes[@]}"; do
    magick -background none -density 512 "$svg_path" -resize "${size}x${size}" "$out_dir/icon${size}.png"
  done

done

mkdir -p "$PREVIEW_DIR"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

label_w=320
cell_w=170
cell_h=170
header_h=92

magick -size "${label_w}x${header_h}" xc:'#E2E8F0' \
  -fill '#0F172A' -pointsize 24 -gravity center \
  -annotate +0+0 'Variant / Size' \
  "$tmp_dir/header-label.png"

for size in "${sizes[@]}"; do
  magick -size "${cell_w}x${header_h}" xc:'#E2E8F0' \
    -fill '#0F172A' -pointsize 24 -gravity center \
    -annotate +0+0 "${size}px" \
    "$tmp_dir/header-${size}.png"
done

magick "$tmp_dir/header-label.png" \
  "$tmp_dir/header-16.png" \
  "$tmp_dir/header-32.png" \
  "$tmp_dir/header-48.png" \
  "$tmp_dir/header-128.png" \
  +append "$tmp_dir/header-row.png"

row_images=()
for entry in "${variants[@]}"; do
  IFS='|' read -r option variant _svg_name row_label <<<"$entry"
  row_key="${option}-${variant}"

  magick -size "${label_w}x${cell_h}" xc:'#F1F5F9' \
    -stroke '#CBD5E1' -strokewidth 2 -fill none -draw "rectangle 1,1 $((label_w-2)),$((cell_h-2))" \
    -fill '#0F172A' -pointsize 24 -gravity center \
    -annotate +0+0 "$row_label" \
    "$tmp_dir/label-${row_key}.png"

  cell_images=()
  for size in "${sizes[@]}"; do
    icon_path="$CONCEPT_DIR/$option/$variant/icon${size}.png"
    cell_path="$tmp_dir/cell-${row_key}-${size}.png"

    magick -size "${cell_w}x${cell_h}" xc:'#F8FAFC' \
      -stroke '#CBD5E1' -strokewidth 2 -fill none -draw "rectangle 1,1 $((cell_w-2)),$((cell_h-2))" \
      \( "$icon_path" -background none -gravity center -extent 128x128 \) \
      -gravity center -geometry +0+18 -composite \
      -fill '#0F172A' -pointsize 18 -gravity north -annotate +0+10 "${size}px" \
      "$cell_path"

    cell_images+=("$cell_path")
  done

  magick "${cell_images[@]}" +append "$tmp_dir/grid-${row_key}.png"
  magick "$tmp_dir/label-${row_key}.png" "$tmp_dir/grid-${row_key}.png" +append "$tmp_dir/row-${row_key}.png"
  row_images+=("$tmp_dir/row-${row_key}.png")
done

magick "$tmp_dir/header-row.png" "${row_images[@]}" -append "$PREVIEW_DIR/icon-comparison-sheet.png"

backgrounds=(
  "#FFFFFF|Light 1"
  "#F3EAD3|Light 2"
  "#FBF1C7|Light 3"
  "#CBD5E1|Mid 1"
  "#829181|Mid 2"
  "#665C54|Mid 3"
  "#1A1B26|Dark 1"
  "#111827|Dark 2"
  "#2D353B|Dark 3"
)

bg_sheet_cols=3
bg_cell_w=300
bg_cell_h=220
bg_label_h=46

bg_cells=()
for entry in "${backgrounds[@]}"; do
  IFS='|' read -r bg_hex bg_label <<<"$entry"
  bg_key="${bg_hex//#/}"
  bg_key="$(echo "$bg_key" | tr 'A-Z' 'a-z')"
  bg_cell="$tmp_dir/bg-cell-${bg_key}.png"

  magick -size "${bg_cell_w}x${bg_cell_h}" "xc:${bg_hex}" \
    -stroke '#64748B' -strokewidth 2 -fill none -draw "rectangle 1,1 $((bg_cell_w-2)),$((bg_cell_h-2))" \
    \( "$CONCEPT_DIR/option2-stacked-tabs/transparent/icon128.png" -background none -gravity center -extent 128x128 \) \
    -gravity center -geometry +0-8 -composite \
    -size "${bg_cell_w}x${bg_label_h}" xc:'#E2E8F0' -gravity south -composite \
    -fill '#0F172A' -pointsize 18 -gravity south -annotate +0+12 "${bg_label} (${bg_hex})" \
    "$bg_cell"

  bg_cells+=("$bg_cell")
done

bg_rows=()
for ((i = 0; i < ${#bg_cells[@]}; i += bg_sheet_cols)); do
  row_slice=("${bg_cells[@]:i:bg_sheet_cols}")
  row_out="$tmp_dir/bg-row-$((i / bg_sheet_cols)).png"
  magick "${row_slice[@]}" +append "$row_out"
  bg_rows+=("$row_out")
done

magick "${bg_rows[@]}" -append "$PREVIEW_DIR/transparent-background-sheet.png"

node "$CHECK_SCRIPT"

echo "Generated concept icons and preview sheet at:"
echo "  $CONCEPT_DIR"
echo "  $PREVIEW_DIR/icon-comparison-sheet.png"
echo "  $PREVIEW_DIR/transparent-background-sheet.png"
