"""Render the silent, local Project LAX opening film. Requires Pillow and ffmpeg."""

from pathlib import Path
import math
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'intro'
OUT.mkdir(parents=True, exist_ok=True)
WIDTH, HEIGHT, FPS, SECONDS = 960, 540, 24, 5
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
GREEN, WHITE, MUTED, YELLOW = '#a9e9bd', '#f7faf7', '#bfd1c4', '#ffdc85'

photo = Image.open(ROOT / 'assets/photos/johannesburg-city.webp').convert('RGB')
scale = max(WIDTH / photo.width, HEIGHT / photo.height)
photo = photo.resize((round(photo.width * scale), round(photo.height * scale)), Image.Resampling.LANCZOS)

def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size)

def ease(value):
    value = max(0, min(1, value))
    return value * value * (3 - 2 * value)

def alpha_text(layer, xy, label, size, color=WHITE, opacity=255, bold=False, spacing=0):
    if opacity <= 0:
        return
    temp = Image.new('RGBA', (WIDTH, HEIGHT))
    draw = ImageDraw.Draw(temp)
    fill = (*Image.new('RGB', (1, 1), color).getpixel((0, 0)), int(opacity))
    if spacing:
        x, y = xy
        for char in label:
            draw.text((x, y), char, font=font(size, bold), fill=fill)
            x += draw.textlength(char, font=font(size, bold)) + spacing
    else:
        draw.text(xy, label, font=font(size, bold), fill=fill)
    layer.alpha_composite(temp)

def frame(t):
    # A small pan gives the Johannesburg photograph a film-like presence.
    max_x = photo.width - WIDTH
    max_y = photo.height - HEIGHT
    x = int(max_x * (.32 + .12 * t / SECONDS))
    y = int(max_y * .38)
    base = photo.crop((x, y, x + WIDTH, y + HEIGHT)).convert('RGBA')
    shade = Image.new('RGBA', (WIDTH, HEIGHT))
    shade_draw = ImageDraw.Draw(shade)
    for column in range(WIDTH):
        shade_draw.line((column, 0, column, HEIGHT), fill=(7, 21, 17, int(235 - 55 * column / WIDTH)))
    base.alpha_composite(shade)
    draw = ImageDraw.Draw(base)
    draw.line((45, 492, 915, 492), fill=(185, 222, 197, 110), width=1)
    draw.rounded_rectangle((45, 510, 45 + int(870 * min(t / SECONDS, 1)), 514), radius=2, fill=GREEN)
    alpha_text(base, (808, 34), '01 / 03' if t < 1.75 else '02 / 03' if t < 3.5 else '03 / 03', 11, MUTED, bold=True)

    if t < 1.95:
        a = int(255 * ease(t / .38) * (1 - ease((t - 1.58) / .35)))
        alpha_text(base, (55, 130), 'ADD YOUR MONEY.', 52, WHITE, a, bold=True)
        alpha_text(base, (55, 198), 'DATE YOUR BILLS.', 52, GREEN, a, bold=True)
        alpha_text(base, (58, 280), 'LAX checks the next 14 days in order.', 20, MUTED, a)
        if a > 0:
            card = Image.new('RGBA', (WIDTH, HEIGHT))
            c = ImageDraw.Draw(card)
            c.rounded_rectangle((58, 356, 432, 433), radius=14, fill=(9, 30, 22, int(a * .9)), outline=(160, 227, 176, int(a * .55)), width=2)
            base.alpha_composite(card)
            alpha_text(base, (79, 372), 'PAY', 13, GREEN, a, bold=True)
            alpha_text(base, (79, 396), 'ARRIVES IN PIECES', 18, WHITE, a, bold=True)
            for i in range(3):
                px = 480 + int(110 * ease((t - .45 - i * .18) / .85))
                r = 6 + int(3 * math.sin(t * 7 + i) ** 2)
                draw.ellipse((px-r, 391-r, px+r, 391+r), fill=(169, 233, 189, a))
            alpha_text(base, (620, 390), 'NEXT BILL  →', 16, WHITE, a, bold=True)
    elif t < 3.65:
        local = t - 1.95
        a = int(255 * ease(local / .36) * (1 - ease((local - 1.35) / .35)))
        alpha_text(base, (55, 120), 'TEST A PURCHASE.', 50, WHITE, a, bold=True)
        alpha_text(base, (55, 190), 'SEE WHICH BILL MOVES.', 39, GREEN, a, bold=True)
        alpha_text(base, (58, 268), 'Compare the plan before and after.', 20, MUTED, a)
        card = Image.new('RGBA', (WIDTH, HEIGHT))
        c = ImageDraw.Draw(card)
        c.rounded_rectangle((58, 345, 590, 431), radius=16, fill=(8, 24, 19, int(a * .93)), outline=(200, 234, 207, int(a * .6)), width=2)
        base.alpha_composite(card)
        alpha_text(base, (80, 364), 'TODAY', 13, GREEN, a, bold=True)
        alpha_text(base, (80, 389), 'R80 DECISION', 21, WHITE, a, bold=True)
        alpha_text(base, (345, 377), '→  NEXT BILL', 19, YELLOW, a, bold=True)
    else:
        local = t - 3.65
        a = int(255 * ease(local / .45))
        alpha_text(base, (59, 145), 'L/X', 100, WHITE, a, bold=True)
        alpha_text(base, (59, 281), 'SEE THE GAP.', 48, WHITE, a, bold=True)
        alpha_text(base, (59, 344), 'CHOOSE A MOVE.', 48, GREEN, a, bold=True)
        alpha_text(base, (60, 426), 'ADD BILL  →  TEST CHOICE  →  CHECK IN', 16, MUTED, a, bold=True, spacing=.7)
    return base.convert('RGB')

command = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'rgb24',
           '-video_size', f'{WIDTH}x{HEIGHT}', '-framerate', str(FPS), '-i', '-',
           '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '28', '-pix_fmt', 'yuv420p',
           '-movflags', '+faststart', str(OUT / 'project-lax-intro.mp4')]
process = subprocess.Popen(command, stdin=subprocess.PIPE)
try:
    for index in range(FPS * SECONDS):
        process.stdin.write(frame(index / FPS).tobytes())
finally:
    process.stdin.close()
if process.wait() != 0:
    raise RuntimeError('ffmpeg failed')
frame(4.5).save(OUT / 'project-lax-poster.webp', quality=85, method=6)
