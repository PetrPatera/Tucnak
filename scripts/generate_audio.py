#!/usr/bin/env python3
"""
Hromadný generátor českého dabingu pro aplikaci „Tučňákův svět“.
Používá bezplatné neurální hlasy Microsoft Edge TTS (cs-CZ-VlastaNeural / cs-CZ-AntoninNeural)
přes knihovnu `edge-tts` a současně ukládá časování slov (WordBoundary) do `assets/audio/timings.json`
pro přesné zvýrazňování karaoke titulků.

Instalace závislostí:
    pip install edge-tts

Spuštění:
    python scripts/generate_audio.py --dry-run
    python scripts/generate_audio.py
    python scripts/generate_audio.py --voice cs-CZ-AntoninNeural --only-id intro_welcome
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any


DEFAULT_MANIFEST = Path(__file__).resolve().parent.parent / "data" / "audio_manifest.json"
DEFAULT_OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "audio"


def load_manifest(manifest_path: Path) -> dict[str, Any]:
    if not manifest_path.exists():
        raise FileNotFoundError(f"Audio manifest nebyl nalezen: {manifest_path}")
    with manifest_path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if "entries" not in data or not isinstance(data["entries"], list):
        raise ValueError("Neplatný formát manifestu: chybí pole 'entries'.")
    return data


def ticks_to_ms(value: int | float) -> int:
    """Převede 100nanosekundové ticky z edge-tts na milisekundy."""
    return int(round(float(value) / 10_000.0))


async def synthesize_entry(
    entry: dict[str, Any],
    out_dir: Path,
    override_voice: str | None = None,
) -> dict[str, Any]:
    import edge_tts  # type: ignore

    entry_id = entry["id"]
    text = entry["text_cs"]
    voice = override_voice or entry.get("voice") or "cs-CZ-VlastaNeural"
    rate = entry.get("rate", "-8%")
    pitch = entry.get("pitch", "+5Hz")

    out_file = out_dir / f"{entry_id}.mp3"
    word_boundaries: list[dict[str, Any]] = []

    communicate = edge_tts.Communicate(
        text=text,
        voice=voice,
        rate=rate,
        pitch=pitch,
        boundary="WordBoundary",
    )

    with out_file.open("wb") as audio_fh:
        async for chunk in communicate.stream():
            chunk_type = chunk.get("type")
            if chunk_type == "audio":
                audio_fh.write(chunk["data"])
            elif chunk_type == "WordBoundary":
                offset_ms = ticks_to_ms(chunk.get("offset", 0))
                duration_ms = ticks_to_ms(chunk.get("duration", 0))
                word_boundaries.append(
                    {
                        "word": str(chunk.get("text", "")).upper(),
                        "startMs": offset_ms,
                        "endMs": offset_ms + duration_ms,
                    }
                )

    return {
        "id": entry_id,
        "file": f"assets/audio/{entry_id}.mp3",
        "voice": voice,
        "karaokeText": entry.get("karaoke_text", text.upper()),
        "words": word_boundaries,
    }


async def run_pipeline(args: argparse.Namespace) -> int:
    manifest = load_manifest(Path(args.manifest))
    entries: list[dict[str, Any]] = manifest["entries"]

    if args.only_id:
        wanted = set(args.only_id)
        entries = [item for item in entries if item["id"] in wanted]
        if not entries:
            print(f"[CHYBA] Žádná položka neodpovídá --only-id: {', '.join(wanted)}", file=sys.stderr)
            return 1

    out_dir = Path(args.out_dir)

    if args.dry_run:
        print(f"=== DRY RUN: Validace audio manifestu ({len(entries)} položek) ===")
        print(f"Výchozí hlas: {args.voice or manifest.get('defaultVoice')}")
        print(f"Výstupní složka: {out_dir}")
        for idx, item in enumerate(entries, start=1):
            voice = args.voice or item.get("voice") or manifest.get("defaultVoice")
            print(
                f"  [{idx:02d}/{len(entries):02d}] {item['id']} -> {item['file']} "
                f"({voice}, rate={item.get('rate')}, pitch={item.get('pitch')}) | "
                f"\"{item['text_cs']}\""
            )
        print("=== Dry run dokončen bez chyb ===")
        return 0

    try:
        import edge_tts  # noqa: F401
    except ImportError:
        print(
            "[CHYBA] Knihovna `edge-tts` není nainstalována. Spusťte:\n"
            "    pip install edge-tts",
            file=sys.stderr,
        )
        return 2

    out_dir.mkdir(parents=True, exist_ok=True)
    timings_path = out_dir / "timings.json"
    timings_map: dict[str, Any] = {}

    if timings_path.exists():
        try:
            with timings_path.open("r", encoding="utf-8") as fh:
                timings_map = json.load(fh)
        except json.JSONDecodeError:
            timings_map = {}

    semaphore = asyncio.Semaphore(args.concurrency)

    async def worker(item: dict[str, Any]) -> None:
        async with semaphore:
            meta = await synthesize_entry(item, out_dir=out_dir, override_voice=args.voice)
            timings_map[item["id"]] = meta
            print(f"[OK] {item['id']} -> {meta['file']} ({len(meta['words'])} slov)")

    await asyncio.gather(*(worker(item) for item in entries))

    with timings_path.open("w", encoding="utf-8") as fh:
        json.dump(timings_map, fh, ensure_ascii=False, indent=2)

    print(f"Hotovo! Vygenerováno {len(entries)} MP3 souborů a časování v {timings_path}.")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generátor českých MP3 replik a karaoke časování pro Tučňákův svět."
    )
    parser.add_argument(
        "--manifest",
        default=str(DEFAULT_MANIFEST),
        help="Cesta k souboru audio_manifest.json",
    )
    parser.add_argument(
        "--out-dir",
        default=str(DEFAULT_OUT_DIR),
        help="Výstupní adresář pro .mp3 soubory a timings.json",
    )
    parser.add_argument(
        "--voice",
        default=None,
        help="Přepíše hlas pro všechny položky (např. cs-CZ-VlastaNeural nebo cs-CZ-AntoninNeural)",
    )
    parser.add_argument(
        "--only-id",
        nargs="+",
        default=None,
        help="Vygeneruje pouze zadaná ID replik",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=4,
        help="Maximální počet paralelních požadavků na TTS API",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Pouze ověří manifest a vypíše plán bez volání sítě",
    )
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run_pipeline(parse_args())))
