"""Render the Project LAX mark for Android legacy launchers and the web app."""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
INK = (15, 24, 21, 255)
WHITE = (246, 255, 248, 255)
MINT = (184, 233, 134, 255)


def icon(size, *, round_icon=False, transparent=False):
    scale = size / 512
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0) if transparent or round_icon else INK)
    draw = ImageDraw.Draw(image)
    if round_icon:
        draw.ellipse((0, 0, size - 1, size - 1), fill=INK)

    def line(points, color, width):
        draw.line([(round(x * scale), round(y * scale)) for x, y in points], fill=color,
                  width=round(width * scale), joint="curve")

    # The full mark stays inside the adaptive icon's central safe circle.
    line([(110, 174), (110, 338), (180, 338)], WHITE, 28)
    line([(310, 174), (390, 338)], WHITE, 28)
    line([(390, 174), (310, 338)], WHITE, 28)
    line([(216, 346), (254, 166)], MINT, 19)
    return image


for folder, size in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96),
                     ("xxhdpi", 144), ("xxxhdpi", 192)):
    output = ROOT / "android/app/src/main/res" / f"mipmap-{folder}"
    for name, options in (("ic_launcher.png", {}),
                          ("ic_launcher_round.png", {"round_icon": True}),
                          ("ic_launcher_foreground.png", {"transparent": True})):
        icon(size * 4, **options).resize((size, size), Image.Resampling.LANCZOS).save(output / name)

for size in (192, 512):
    icon(size * 2).resize((size, size), Image.Resampling.LANCZOS).convert("RGB").save(
        ROOT / "assets" / f"app-icon-{size}.png")
