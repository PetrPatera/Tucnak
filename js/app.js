/**
 * Tučňákův svět — Modulární jádro aplikace (5–7 let)
 * Architektura odděluje:
 *  1) Datovou vrstvu (JSON katalog aktivit + audio manifest)
 *  2) Audio & Karaoke engine (MP3 + Web Speech API + Web Audio SFX)
 *  3) Stavový automat tučňáka Pika (IDLE, SPEAKING, THINKING, HAPPY, ENCOURAGE, SLEEPY)
 *  4) Herní a kreslicí enginy (Zóna A, B, C, D)
 *  5) Rodičovskou zónu s 3s zámkem, časovačem a galerií
 */

(function () {
  "use strict";

  const STORAGE_KEY = "tucnakuv_svet_state_v1";

  /* =========================================================================
   * 1. ÚLOŽIŠTĚ POKROKU A NASTAVENÍ (LocalStorage)
   * ========================================================================= */
  class ProgressStore {
    constructor() {
      this.state = this.load();
    }

    defaultState() {
      return {
        starsEarned: {}, // { act_01_step_draw: 1, ... }
        zoneActivityTimeSec: {
          zone_a: 180,
          zone_b: 120,
          zone_c: 90,
          zone_d: 150,
          zone_e: 60
        },
        gallery: [], // [{ id, title, dataUrl, createdAt }]
        settings: {
          limitMinutes: 30,
          voiceVol: 0.9,
          sfxVol: 0.75,
          musicVol: 0.35
        }
      };
    }

    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return this.defaultState();
        const parsed = JSON.parse(raw);
        return {
          ...this.defaultState(),
          ...parsed,
          settings: { ...this.defaultState().settings, ...(parsed.settings || {}) },
          zoneActivityTimeSec: {
            ...this.defaultState().zoneActivityTimeSec,
            ...(parsed.zoneActivityTimeSec || {})
          }
        };
      } catch (err) {
        return this.defaultState();
      }
    }

    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch (err) {
        console.warn("Nepodařilo se uložit stav do localStorage:", err);
      }
    }

    recordSuccess(actId, zoneId, stars) {
      const prev = this.state.starsEarned[actId] || 0;
      if (stars > prev) {
        this.state.starsEarned[actId] = stars;
      }
      this.state.zoneActivityTimeSec[zoneId] = (this.state.zoneActivityTimeSec[zoneId] || 0) + 45;
      this.save();
    }

    addArtwork(title, dataUrl) {
      this.state.gallery.unshift({
        id: "art_" + Date.now(),
        title,
        dataUrl,
        createdAt: new Date().toLocaleString("cs-CZ")
      });
      if (this.state.gallery.length > 18) {
        this.state.gallery.length = 18;
      }
      this.save();
    }

    deleteArtwork(id) {
      this.state.gallery = this.state.gallery.filter((item) => item.id !== id);
      this.save();
    }
  }

  /* =========================================================================
   * 2. AUDIO & KARAOKE ENGINE
   * ========================================================================= */
  class AudioKaraokeEngine {
    constructor(manifest, store) {
      this.manifestMap = new Map();
      (manifest.entries || []).forEach((entry) => this.manifestMap.set(entry.id, entry));
      this.timingsMap = {};
      this.store = store;

      this.karaokeEl = document.getElementById("karaoke-text");
      this.currentAudio = null;
      this.karaokeTimer = null;
      this.speechGen = 0;
      this.lastSpoken = { id: "intro_welcome", overrideText: null };
      this.audioCtx = null;
      this.musicInterval = null;
      this.canLoadMp3 = window.location.protocol !== "file:";
      this.onSpeakStart = null;
      this.onSpeakEnd = null;

      if (this.canLoadMp3) {
        this.loadTimings();
      }
    }

    async loadTimings() {
      try {
        const res = await fetch("./assets/audio/timings.json?v=2");
        if (res.ok) {
          this.timingsMap = await res.json();
        }
      } catch (_err) {
        // Běží v režimu fallback Web Speech API
      }
    }

    ensureAudioCtx() {
      if (!this.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
          this.audioCtx = new Ctx();
        }
      }
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    }

    playTone(freq, duration = 0.14, type = "sine", gainPeak = 0.18, delay = 0) {
      const vol = this.store.state.settings.sfxVol;
      if (vol <= 0.01) return;
      const ctx = this.ensureAudioCtx();
      if (!ctx) return;

      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(gainPeak * vol, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    }

    playChirp() {
      const vol = this.store.state.settings.sfxVol;
      if (vol <= 0.01) return;
      const ctx = this.ensureAudioCtx();
      if (!ctx) return;
      [0, 0.065].forEach((offset, idx) => {
        const start = ctx.currentTime + offset;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(idx === 0 ? 740 : 880, start);
        osc.frequency.exponentialRampToValueAtTime(idx === 0 ? 1080 : 1320, start + 0.055);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.09 * vol, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.065);
      });
    }

    playSfx(kind) {
      switch (kind) {
        case "chirp":
          this.playChirp();
          break;
        case "pop":
          this.playTone(520, 0.1, "triangle", 0.2);
          break;
        case "snap":
          this.playTone(587, 0.1, "sine", 0.22, 0);
          this.playTone(880, 0.14, "sine", 0.22, 0.07);
          break;
        case "mix":
          this.playTone(440, 0.12, "triangle", 0.2, 0);
          this.playTone(554, 0.12, "triangle", 0.2, 0.09);
          this.playTone(659, 0.22, "sine", 0.24, 0.18);
          break;
        case "nudge":
          this.playTone(392, 0.14, "sine", 0.14, 0);
          this.playTone(349, 0.18, "sine", 0.14, 0.1);
          break;
        case "celebrate":
          [523, 659, 784, 1046].forEach((freq, idx) => {
            this.playTone(freq, 0.22, "triangle", 0.22, idx * 0.09);
          });
          break;
        case "count":
          this.playTone(660, 0.11, "sine", 0.18);
          break;
        default:
          this.playTone(480, 0.1, "sine", 0.15);
      }
    }

    startAmbientMusic() {
      if (this.musicInterval) return;
      const notes = [261.6, 329.6, 392.0, 329.6, 293.7, 349.2, 392.0, 523.3];
      let step = 0;
      this.musicInterval = setInterval(() => {
        const musicVol = this.store.state.settings.musicVol;
        if (musicVol <= 0.02 || document.hidden) return;
        const ctx = this.audioCtx;
        if (!ctx || ctx.state !== "running") return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(notes[step % notes.length], ctx.currentTime);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.035 * musicVol, ctx.currentTime + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.85);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.9);
        step += 1;
      }, 950);
    }

    stopCurrentSpeech() {
      this.speechGen += 1;
      if (this.karaokeTimer) {
        clearInterval(this.karaokeTimer);
        this.karaokeTimer = null;
      }
      if (this.currentAudio) {
        this.currentAudio.pause();
        this.currentAudio = null;
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    }

    renderKaraokeWords(upperText) {
      const words = upperText.trim().split(/\s+/);
      this.karaokeEl.innerHTML = words
        .map((w, idx) => `<span class="karaoke-word" data-idx="${idx}">${w}</span>`)
        .join(" ");
      return Array.from(this.karaokeEl.querySelectorAll(".karaoke-word"));
    }

    highlightWord(wordSpans, index) {
      wordSpans.forEach((span, i) => {
        span.classList.toggle("active", i === index);
      });
    }

    speakCustom(spokenText, displayKaraoke = null, options = {}) {
      this.speak(null, spokenText, {
        ...options,
        displayKaraoke: displayKaraoke || spokenText
      });
    }

    speak(entryId, overrideText = null, options = {}) {
      const entry = entryId ? this.manifestMap.get(entryId) : null;
      const spokenText = overrideText || (entry ? entry.text_cs : entryId || "");
      const rawKaraoke = options.displayKaraoke || overrideText || (entry ? entry.karaoke_text : spokenText);
      const karaokeText = String(rawKaraoke || "").toUpperCase();

      this.lastSpoken = { id: entryId, overrideText, options };
      this.stopCurrentSpeech();
      const gen = this.speechGen;

      const wordSpans = this.renderKaraokeWords(karaokeText);
      const voiceVol = this.store.state.settings.voiceVol;

      if (this.onSpeakStart) this.onSpeakStart(options.stateDuringSpeech || "SPEAKING");
      if (!entry || entry.category !== "number") {
        this.playChirp();
      }

      const finish = () => {
        if (gen !== this.speechGen) return;
        this.highlightWord(wordSpans, -1);
        if (this.karaokeTimer) {
          clearInterval(this.karaokeTimer);
          this.karaokeTimer = null;
        }
        if (this.onSpeakEnd) this.onSpeakEnd(options.stateAfterSpeech || "IDLE");
      };

      // Pokus o přehrání předgenerovaného MP3 souboru, pokud aplikace běží přes HTTP(S)
      if (!overrideText && entry && this.canLoadMp3 && voiceVol > 0.01) {
        const audio = new Audio("./" + entry.file + "?v=2");
        audio.volume = voiceVol;
        let fellBack = false;

        const runFallback = () => {
          if (fellBack) return;
          fellBack = true;
          this.speakViaWebSpeech(spokenText, wordSpans, voiceVol, finish);
        };

        audio.addEventListener("error", runFallback, { once: true });
        audio.addEventListener("ended", finish, { once: true });
        audio.addEventListener("play", () => {
          const timing = this.timingsMap[entryId];
          if (timing && Array.isArray(timing.words) && timing.words.length > 0) {
            this.karaokeTimer = setInterval(() => {
              const nowMs = audio.currentTime * 1000;
              const idx = timing.words.findIndex((w) => nowMs >= w.startMs && nowMs <= w.endMs + 120);
              if (idx >= 0) this.highlightWord(wordSpans, idx);
            }, 60);
          } else {
            this.runHeuristicKaraoke(wordSpans, Math.max(1600, (audio.duration || 3) * 1000));
          }
        });

        this.currentAudio = audio;
        audio.play().catch(runFallback);
        return;
      }

      this.speakViaWebSpeech(spokenText, wordSpans, voiceVol, finish);
    }

    speakViaWebSpeech(spokenText, wordSpans, voiceVol, onFinish, customRate = null) {
      // DŮLEŽITÉ: Převedeme text na malá písmena, aby český syntetizátor NIKDY nečetl
      // krátká slova nebo slabiky (např. RY, BA, KO, LO, PES, LES) po jednotlivých písmenech jako zkratky!
      const cleanSpeech = String(spokenText || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s.,?!:;+-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
      const estimatedMs = Math.max(950, cleanSpeech.length * 68);
      if (!("speechSynthesis" in window) || voiceVol <= 0.01 || !cleanSpeech) {
        this.runHeuristicKaraoke(wordSpans, estimatedMs, onFinish);
        return;
      }

      const utter = new SpeechSynthesisUtterance(cleanSpeech);
      utter.lang = "cs-CZ";
      utter.rate = customRate || 1.0;
      utter.pitch = 1.38;
      utter.volume = voiceVol;

      const voices = window.speechSynthesis.getVoices();
      const csVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("cs"));
      if (csVoice) utter.voice = csVoice;

      let boundaryFired = false;
      utter.onboundary = (ev) => {
        if (ev.name === "word" || typeof ev.charIndex === "number") {
          boundaryFired = true;
          const upTo = cleanSpeech.slice(0, ev.charIndex).trim();
          const idx = upTo ? upTo.split(/\s+/).length : 0;
          this.highlightWord(wordSpans, Math.min(idx, wordSpans.length - 1));
        }
      };

      let finished = false;
      const safeFinish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(safetyTimeout);
        onFinish();
      };

      const safetyTimeout = setTimeout(safeFinish, estimatedMs + 1500);
      utter.onend = safeFinish;
      utter.onerror = safeFinish;

      this.runHeuristicKaraoke(wordSpans, estimatedMs, null, () => boundaryFired);

      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.speak(utter);
      } catch (_err) {
        this.runHeuristicKaraoke(wordSpans, estimatedMs, safeFinish);
      }
    }

    runHeuristicKaraoke(wordSpans, totalMs, onDone = null, shouldYield = null) {
      if (this.karaokeTimer) clearInterval(this.karaokeTimer);
      if (!wordSpans.length) {
        if (onDone) setTimeout(onDone, totalMs);
        return;
      }
      const stepMs = Math.max(190, totalMs / wordSpans.length);
      let idx = 0;
      this.highlightWord(wordSpans, 0);
      this.karaokeTimer = setInterval(() => {
        if (shouldYield && shouldYield()) return;
        idx += 1;
        if (idx >= wordSpans.length) {
          clearInterval(this.karaokeTimer);
          this.karaokeTimer = null;
          if (onDone) onDone();
        } else {
          this.highlightWord(wordSpans, idx);
        }
      }, stepMs);
    }

    repeatLast() {
      this.speak(this.lastSpoken.id, this.lastSpoken.overrideText);
    }
  }

  /* =========================================================================
   * 3. STAVOVÝ AUTOMAT TUČŇÁKA PIKA
   * ========================================================================= */
  class PenguinMascot {
    constructor(audioEngine) {
      this.audio = audioEngine;
      this.containerEl = document.getElementById("penguin-container");
      this.particlesEl = document.getElementById("penguin-particles");
      this.statePillEl = document.getElementById("penguin-state-pill");
      this.celebrationLayer = document.getElementById("celebration-layer");

      this.state = "IDLE";
      this.inactivityTimer = null;
      this.onHintTimeout = null;

      this.audio.onSpeakStart = (st) => this.setState(st || "SPEAKING");
      this.audio.onSpeakEnd = (st) => this.setState(st || "IDLE");
    }

    setState(nextState) {
      this.state = nextState;
      const classes = [
        "state-idle",
        "state-speaking",
        "state-thinking",
        "state-happy",
        "state-encourage",
        "state-sleepy"
      ];
      this.containerEl.classList.remove(...classes);
      this.containerEl.classList.add("state-" + nextState.toLowerCase());
      this.statePillEl.textContent = nextState;
    }

    emitParticles(emojis = ["⭐", "✨", "💙"]) {
      for (let i = 0; i < 7; i++) {
        const span = document.createElement("span");
        span.className = "particle-emoji";
        span.textContent = emojis[i % emojis.length];
        span.style.left = 20 + Math.random() * 70 + "%";
        span.style.top = 35 + Math.random() * 30 + "%";
        span.style.setProperty("--dx", (Math.random() * 90 - 45).toFixed(0) + "px");
        this.particlesEl.appendChild(span);
        setTimeout(() => span.remove(), 1350);
      }
    }

    launchConfetti() {
      const icons = ["⭐", "✨", "🎉", "🐟", "💙", "❄️"];
      for (let i = 0; i < 24; i++) {
        const item = document.createElement("span");
        item.className = "confetti-item";
        item.textContent = icons[i % icons.length];
        item.style.left = 5 + Math.random() * 90 + "vw";
        item.style.top = -10 - Math.random() * 30 + "px";
        item.style.animationDelay = (Math.random() * 0.45).toFixed(2) + "s";
        this.celebrationLayer.appendChild(item);
        setTimeout(() => item.remove(), 2200);
      }
    }

    celebrate(audioId = "celebrate_01", overrideText = null) {
      this.audio.playSfx("celebrate");
      this.emitParticles(["⭐", "✨", "🐟", "❤️"]);
      this.launchConfetti();
      this.audio.speak(audioId, overrideText, {
        stateDuringSpeech: "HAPPY",
        stateAfterSpeech: "IDLE"
      });
    }

    gentleNudge(audioId, overrideText = null, escalateToThinking = false) {
      this.audio.playSfx("nudge");
      this.audio.speak(audioId, overrideText, {
        stateDuringSpeech: escalateToThinking ? "THINKING" : "ENCOURAGE",
        stateAfterSpeech: escalateToThinking ? "THINKING" : "IDLE"
      });
    }

    resetInactivityTimer(hintCallback) {
      this.clearInactivityTimer();
      this.onHintTimeout = hintCallback;
      this.inactivityTimer = setTimeout(() => {
        if (this.state === "SLEEPY") return;
        this.setState("THINKING");
        if (this.onHintTimeout) {
          this.onHintTimeout();
        } else {
          this.audio.speak("hint_idle_encourage", null, {
            stateDuringSpeech: "THINKING",
            stateAfterSpeech: "IDLE"
          });
        }
      }, 15000);
    }

    clearInactivityTimer() {
      if (this.inactivityTimer) {
        clearTimeout(this.inactivityTimer);
        this.inactivityTimer = null;
      }
    }
  }

  /* =========================================================================
   * POMOCNÉ FUNKCE: NÁHODNÉ MÍCHÁNÍ A JEDNOTNÉ MANDATORNÍ OKNO POKRAČOVÁNÍ
   * ========================================================================= */
  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function showContinueBanner(hostEl, options = {}) {
    const existing = hostEl.querySelector(".continue-banner");
    if (existing) existing.remove();

    const banner = document.createElement("div");
    banner.className = "continue-banner";
    const icon = options.icon || "🎉";
    const title = options.title || "VÝBORNĚ! ÚKOL JE HOTOVÝ!";
    const subtitle = options.subtitle || "Klečni na velké zelené tlačítko a pokračuj na další úkol!";
    const nextLabel = options.nextLabel || "▶️ POKRAČOVAT NA DALŠÍ ÚKOL ➔";

    banner.innerHTML = `
      <div class="continue-modal-box">
        <div class="continue-modal-icon">${icon}</div>
        <div class="continue-banner-text">${title}</div>
        <div class="continue-banner-sub">${subtitle}</div>
        <div class="continue-banner-btns">
          ${options.onReplay ? `<button type="button" class="btn-touch btn-secondary btn-banner-replay">🔄 ZNOVU</button>` : ""}
          <button type="button" class="btn-touch btn-next-task btn-banner-next">${nextLabel}</button>
        </div>
      </div>
    `;

    hostEl.appendChild(banner);

    if (window.penguinApp && window.penguinApp.audio) {
      const spoken = options.spokenText || `${title} Pokračuj na další úkol!`;
      window.penguinApp.audio.speakCustom(spoken, title);
    }

    const nextBtn = banner.querySelector(".btn-banner-next");
    if (nextBtn && options.onNext) {
      nextBtn.addEventListener("click", () => {
        banner.remove();
        options.onNext();
      });
    }
    const replayBtn = banner.querySelector(".btn-banner-replay");
    if (replayBtn && options.onReplay) {
      replayBtn.addEventListener("click", () => {
        banner.remove();
        options.onReplay();
      });
    }
  }

  /* =========================================================================
   * 3B. UNIVERZÁLNÍ DRAG & DROP HELPER + RGB KRUH + PALETA BAREV A PERA
   * ========================================================================= */
  /**
   * Připojí pointer drag-and-drop na zdrojové prvky.
   * Samotné kliknutí (single tap bez tažení) NIC NEUMÍSTÍ — volitelně jen zavolá onTap (např. přečtení slova).
   * Přetažením lze skládat položky libovolně i na přeskáčku do jakéhokoliv cílového slotu.
   */
  function bindPointerDragDrop({
    containerEl,
    sourceSelector,
    targetSelector,
    canDrag = () => true,
    onTap = null,
    onDrop
  }) {
    const sources = containerEl.querySelectorAll(sourceSelector);
    sources.forEach((srcEl) => {
      srcEl.style.touchAction = "none";
      srcEl.style.userSelect = "none";
      srcEl.addEventListener("contextmenu", (ev) => ev.preventDefault());
      srcEl.addEventListener("dragstart", (ev) => ev.preventDefault());

      srcEl.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        if (!canDrag(srcEl)) return;
        e.preventDefault();

        const startX = e.clientX;
        const startY = e.clientY;
        const rect = srcEl.getBoundingClientRect();
        const offsetX = startX - rect.left;
        const offsetY = startY - rect.top;
        let moved = false;
        let floatingEl = null;
        let lastHoverTarget = null;

        const clearHover = () => {
          if (lastHoverTarget) {
            lastHoverTarget.classList.remove("drop-target-hover");
            lastHoverTarget = null;
          }
        };

        const findTargetAt = (x, y) => {
          const targets = Array.from(containerEl.querySelectorAll(targetSelector));
          let best = null;
          let bestDist = Infinity;
          for (const t of targets) {
            const tr = t.getBoundingClientRect();
            const pad = 16;
            if (
              x >= tr.left - pad &&
              x <= tr.right + pad &&
              y >= tr.top - pad &&
              y <= tr.bottom + pad
            ) {
              const cx = (tr.left + tr.right) / 2;
              const cy = (tr.top + tr.bottom) / 2;
              const d = Math.hypot(x - cx, y - cy);
              if (d < bestDist) {
                bestDist = d;
                best = t;
              }
            }
          }
          return best;
        };

        const onMove = (me) => {
          const dx = me.clientX - startX;
          const dy = me.clientY - startY;
          if (!moved && Math.hypot(dx, dy) > 8) {
            moved = true;
            srcEl.classList.add("dragging-source");
            floatingEl = srcEl.cloneNode(true);
            floatingEl.classList.add("drag-floating-clone");
            floatingEl.style.width = `${Math.max(64, rect.width)}px`;
            floatingEl.style.height = `${Math.max(54, rect.height)}px`;
            document.body.appendChild(floatingEl);
          }
          if (moved && floatingEl) {
            floatingEl.style.left = `${me.clientX - offsetX}px`;
            floatingEl.style.top = `${me.clientY - offsetY}px`;
            const target = findTargetAt(me.clientX, me.clientY);
            if (target !== lastHoverTarget) {
              clearHover();
              if (target) {
                target.classList.add("drop-target-hover");
                lastHoverTarget = target;
              }
            }
          }
        };

        const onEnd = (ue) => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onEnd);
          window.removeEventListener("pointercancel", onEnd);
          clearHover();
          srcEl.classList.remove("dragging-source");
          if (floatingEl) {
            floatingEl.remove();
            floatingEl = null;
          }
          if (!moved) {
            if (typeof onTap === "function") {
              onTap(srcEl, ue);
            }
            return;
          }
          const dropTarget = findTargetAt(ue.clientX, ue.clientY);
          if (dropTarget && typeof onDrop === "function") {
            onDrop(srcEl, dropTarget, ue);
          }
        };

        window.addEventListener("pointermove", onMove, { passive: false });
        window.addEventListener("pointerup", onEnd);
        window.addEventListener("pointercancel", onEnd);
      });
    });
  }

  const EXTENDED_SWATCH_PALETTE = [
    { hex: "#1D3557", name: "tmavě modrá" },
    { hex: "#E63946", name: "červená" },
    { hex: "#FFD166", name: "žlutá" },
    { hex: "#118AB2", name: "modrá" },
    { hex: "#F77F00", name: "oranžová" },
    { hex: "#06D6A0", name: "zelená" },
    { hex: "#7209B7", name: "fialová" },
    { hex: "#FF5D8F", name: "růžová" },
    { hex: "#4CC9F0", name: "azurová" },
    { hex: "#8D6E63", name: "hnědá" },
    { hex: "#64748B", name: "šedá" },
    { hex: "#111827", name: "černá" }
  ];

  const MIX_BASE_COLORS = [
    { id: "yellow", name: "žlutá", label: "ŽLUTÁ", hex: "#FFD166", textColor: "#1D3557" },
    { id: "red", name: "červená", label: "ČERVENÁ", hex: "#E63946", textColor: "#FFFFFF" },
    { id: "blue", name: "modrá", label: "MODRÁ", hex: "#118AB2", textColor: "#FFFFFF" },
    { id: "white", name: "bílá", label: "BÍLÁ", hex: "#F8FAFC", textColor: "#1D3557" },
    { id: "green", name: "zelená", label: "ZELENÁ", hex: "#06D6A0", textColor: "#1D3557" },
    { id: "black", name: "černá", label: "ČERNÁ", hex: "#1E293B", textColor: "#FFFFFF" }
  ];

  const PEN_SIZES = [
    { size: 4, dot: 5, label: "JEMNÉ", spoken: "jemné pero" },
    { size: 9, dot: 9, label: "STŘEDNÍ", spoken: "střední pero" },
    { size: 15, dot: 13, label: "SILNÉ", spoken: "silné pero" },
    { size: 22, dot: 18, label: "ŠTĚTEC", spoken: "velký štětec" }
  ];

  function hexToRgbObj(hex) {
    const clean = (hex || "#000000").replace("#", "");
    const num = parseInt(clean, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  function rgbObjToHex({ r, g, b }) {
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    return (
      "#" +
      [clamp(r), clamp(g), clamp(b)]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase()
    );
  }

  function hslToHex(h, s, l) {
    const sNorm = s / 100;
    const lNorm = l / 100;
    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lNorm - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return rgbObjToHex({
      r: (r + m) * 255,
      g: (g + m) * 255,
      b: (b + m) * 255
    });
  }

  function mixTwoColors(c1, c2) {
    const pair = [c1.id, c2.id].sort().join("+");
    const recipes = {
      "blue+yellow": { hex: "#2A9D8F", name: "zelená", audioId: "color_mix_yellow_blue" },
      "red+yellow": { hex: "#F77F00", name: "oranžová", audioId: "color_mix_red_yellow" },
      "blue+red": { hex: "#7209B7", name: "fialová", audioId: "color_mix_red_blue" },
      "red+white": { hex: "#FF758F", name: "růžová", audioId: null },
      "blue+white": { hex: "#4CC9F0", name: "světle modrá", audioId: null },
      "green+white": { hex: "#80ED99", name: "světle zelená", audioId: null },
      "white+yellow": { hex: "#FFF3B0", name: "krémově žlutá", audioId: null },
      "black+white": { hex: "#94A3B8", name: "šedá", audioId: null },
      "green+red": { hex: "#8D5B4C", name: "hnědá", audioId: null },
      "blue+green": { hex: "#00B4D8", name: "tyrkysová", audioId: null },
      "green+yellow": { hex: "#AACC00", name: "limetková", audioId: null },
      "black+red": { hex: "#800F2F", name: "vínová", audioId: null },
      "black+blue": { hex: "#1D3557", name: "námořnická modrá", audioId: null },
      "black+yellow": { hex: "#606C38", name: "olivová", audioId: null },
      "black+green": { hex: "#1B4332", name: "lesní zelená", audioId: null }
    };
    if (recipes[pair]) {
      return recipes[pair];
    }
    if (c1.id === c2.id) {
      return { hex: c1.hex, name: c1.name, audioId: null };
    }
    const rgb1 = hexToRgbObj(c1.hex);
    const rgb2 = hexToRgbObj(c2.hex);
    const blended = rgbObjToHex({
      r: (rgb1.r + rgb2.r) / 2,
      g: (rgb1.g + rgb2.g) / 2,
      b: (rgb1.b + rgb2.b) / 2
    });
    return { hex: blended, name: "namíchaná barva", audioId: null };
  }

  function mountRgbColorWheel(canvasEl, previewEl, onPickColor) {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    const size = canvasEl.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 2;

    for (let angle = 0; angle < 360; angle += 1) {
      const startAngle = ((angle - 1) * Math.PI) / 180;
      const endAngle = ((angle + 1) * Math.PI) / 180;
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius);
      grad.addColorStop(0, "#FFFFFF");
      grad.addColorStop(0.65, `hsl(${angle}, 100%, 50%)`);
      grad.addColorStop(1, `hsl(${angle}, 100%, 32%)`);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    const pickFromEvent = (e) => {
      const rect = canvasEl.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * size;
      const y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * size;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.min(radius, Math.hypot(dx, dy));
      const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      const ratio = dist / radius;
      const sat = Math.min(100, Math.round(ratio * 115));
      const light = ratio < 0.65
        ? Math.round(100 - (ratio / 0.65) * 50)
        : Math.round(50 - ((ratio - 0.65) / 0.35) * 18);
      const hex = hslToHex(angle, sat, light);
      if (previewEl) {
        previewEl.style.background = hex;
      }
      if (typeof onPickColor === "function") {
        onPickColor(hex);
      }
    };

    let dragging = false;
    canvasEl.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      dragging = true;
      try {
        canvasEl.setPointerCapture(e.pointerId);
      } catch (_err) {}
      pickFromEvent(e);
    });
    canvasEl.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      e.preventDefault();
      pickFromEvent(e);
    });
    const endWheel = () => {
      dragging = false;
    };
    canvasEl.addEventListener("pointerup", endWheel);
    canvasEl.addEventListener("pointercancel", endWheel);
  }

  function renderPenSizeMarkup(activeSize = 9) {
    return `
      <div class="pen-size-row">
        ${PEN_SIZES.map(
          (p) => `
          <button class="btn-touch btn-pen-size ${p.size === activeSize ? "active" : ""}" data-pen-size="${p.size}" data-spoken="${p.spoken}" title="${p.label}" aria-label="${p.label}">
            <span class="pen-size-dot" style="width:${p.dot}px; height:${p.dot}px;"></span>
          </button>
        `
        ).join("")}
      </div>
    `;
  }

  function floodFillCanvas(ctx, startX, startY, fillColorHex) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const x0 = Math.floor(startX);
    const y0 = Math.floor(startY);
    if (x0 < 0 || x0 >= w || y0 < 0 || y0 >= h) return;

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = new Uint32Array(imgData.data.buffer);

    const rgb = hexToRgbObj(fillColorHex);
    const fillVal = (255 << 24) | (rgb.b << 16) | (rgb.g << 8) | rgb.r;
    const targetVal = data[y0 * w + x0];

    if (targetVal === fillVal) return;

    const tr = targetVal & 0xff;
    const tg = (targetVal >> 8) & 0xff;
    const tb = (targetVal >> 16) & 0xff;
    const ta = (targetVal >> 24) & 0xff;

    const isMatch = (idx) => {
      const val = data[idx];
      if (val === targetVal) return true;
      const r = val & 0xff;
      const g = (val >> 8) & 0xff;
      const b = (val >> 16) & 0xff;
      const a = (val >> 24) & 0xff;
      return Math.abs(r - tr) <= 32 && Math.abs(g - tg) <= 32 && Math.abs(b - tb) <= 32 && Math.abs(a - ta) <= 32;
    };

    const queue = [x0, y0];
    const visited = new Uint8Array(w * h);
    visited[y0 * w + x0] = 1;

    while (queue.length > 0) {
      const cy = queue.pop();
      const cx = queue.pop();
      const idx = cy * w + cx;
      data[idx] = fillVal;

      const neighbors = [
        cx + 1, cy,
        cx - 1, cy,
        cx, cy + 1,
        cx, cy - 1
      ];

      for (let i = 0; i < neighbors.length; i += 2) {
        const nx = neighbors[i];
        const ny = neighbors[i + 1];
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const nidx = ny * w + nx;
          if (!visited[nidx] && isMatch(nidx)) {
            visited[nidx] = 1;
            queue.push(nx, ny);
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  // --- REÁLNÉ ŠABLONY PRO KRESLENÍ KROK ZA KROKEM (25 OBJEKTŮ DLE 1★–5★) ---
  const REAL_STEP_DRAW_CATALOG = [
    // 1★ ZÁKLADNÍ TVARY A PŘEDMĚTY (3 KROKY)
    {
      stars: 1,
      title: "VESELÉ SLUNÍČKO",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Kruh sluníčka", type: "circle", cx: 360, cy: 230, r: 85, strokeColor: "#E76F51" },
        { id: "s2", label: "Hřejivé paprsky", type: "arcs", paths: [[[360, 120], [360, 50]], [[360, 340], [360, 410]], [[250, 230], [180, 230]], [[470, 230], [540, 230]], [[280, 150], [230, 100]], [[440, 150], [490, 100]], [[280, 310], [230, 360]], [[440, 310], [490, 360]]], strokeColor: "#F77F00" },
        { id: "s3", label: "Očička a úsměv", type: "arcs", paths: [[[320, 210], [320, 215]], [[400, 210], [400, 215]], [[320, 255], [360, 285], [400, 255]]], strokeColor: "#1D3557" }
      ]
    },
    {
      stars: 1,
      title: "POHÁDKOVÝ DOMEČEK",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Zdi domečku", type: "arcs", paths: [[[230, 220], [490, 220], [490, 400], [230, 400], [230, 220]]], strokeColor: "#1D3557" },
        { id: "s2", label: "Špičatá střecha", type: "arcs", paths: [[[190, 220], [360, 90], [530, 220], [190, 220]]], strokeColor: "#E63946" },
        { id: "s3", label: "Dveře a okénka", type: "arcs", paths: [[[325, 400], [325, 290], [395, 290], [395, 400]], [[255, 260], [305, 260], [305, 310], [255, 310], [255, 260]], [[415, 260], [465, 260], [465, 310], [415, 310], [415, 260]]], strokeColor: "#2A9D8F" },
        { id: "s4", label: "Komín a kouř", type: "arcs", paths: [[[420, 140], [420, 70], [455, 70], [455, 170]], [[437, 50], [445, 30], [437, 10]]], strokeColor: "#8D5B4C" }
      ]
    },
    {
      stars: 1,
      title: "LESNÍ HŘÍBEK",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Silná nožička", type: "arcs", paths: [[[310, 230], [290, 390], [430, 390], [410, 230]]], strokeColor: "#E9C46A" },
        { id: "s2", label: "Kulatý klobouček", type: "arcs", paths: [[[190, 230], [210, 140], [360, 90], [510, 140], [530, 230], [190, 230]]], strokeColor: "#E76F51" },
        { id: "s3", label: "Tečky a tráva", type: "arcs", paths: [[[260, 170], [280, 170]], [[360, 140], [380, 140]], [[440, 170], [460, 170]], [[260, 390], [280, 360], [300, 390], [320, 360], [460, 390]]], strokeColor: "#2A9D8F" }
      ]
    },
    {
      stars: 1,
      title: "ROZKVETLÁ KYTIČKA",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Kulatý střed", type: "circle", cx: 360, cy: 180, r: 42, strokeColor: "#E9C46A" },
        { id: "s2", label: "Okvětní lístky", type: "arcs", paths: [[[360, 138], [330, 80], [390, 80], [360, 138]], [[360, 222], [330, 280], [390, 280], [360, 222]], [[318, 180], [260, 150], [260, 210], [318, 180]], [[402, 180], [460, 150], [460, 210], [402, 180]]], strokeColor: "#E63946" },
        { id: "s3", label: "Stonek a lístky", type: "arcs", paths: [[[360, 222], [360, 410]], [[360, 310], [290, 280], [360, 330]], [[360, 330], [430, 300], [360, 350]]], strokeColor: "#2A9D8F" }
      ]
    },
    {
      stars: 1,
      title: "ZLATÁ RYBIČKA",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Tělíčko rybky", type: "ellipse", cx: 340, cy: 235, rx: 125, ry: 75, strokeColor: "#F4A261" },
        { id: "s2", label: "Ocásek a ploutve", type: "arcs", paths: [[[465, 235], [560, 160], [540, 310], [465, 235]], [[320, 160], [360, 100], [390, 160]]], strokeColor: "#E76F51" },
        { id: "s3", label: "Očičko a bublinka", type: "circle", cx: 250, cy: 220, r: 16, strokeColor: "#1D3557" }
      ]
    },

    // 2★ ZVÍŘÁTKA A DOPRAVNÍ PROSTŘEDKY (3-4 KROKY)
    {
      stars: 2,
      title: "VESELÝ TUČŇÁK PIKO",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Velké tělo", type: "ellipse", cx: 360, cy: 240, rx: 110, ry: 140, strokeColor: "#1D3557" },
        { id: "s2", label: "Bříško a křídla", type: "arcs", paths: [[[250, 210], [180, 260], [230, 310]], [[470, 210], [540, 260], [490, 310]], [[360, 170], [310, 250], [360, 350], [410, 250], [360, 170]]], strokeColor: "#457B9D" },
        { id: "s3", label: "Oči, zobáček a nožky", type: "arcs", paths: [[[335, 170], [335, 175]], [[385, 170], [385, 175]], [[340, 195], [360, 220], [380, 195], [340, 195]], [[310, 380], [330, 410]], [[390, 380], [410, 410]]], strokeColor: "#F77F00" }
      ]
    },
    {
      stars: 2,
      title: "SNĚHULÁK KULÍŠEK",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Spodní koule", type: "circle", cx: 360, cy: 320, r: 85, strokeColor: "#457B9D" },
        { id: "s2", label: "Hlava s hrncem", type: "arcs", paths: [[[360, 170], [300, 170], [300, 235], [420, 235], [420, 170], [360, 170]], [[310, 170], [320, 100], [400, 100], [410, 170]]], strokeColor: "#1D3557" },
        { id: "s3", label: "Mrkev a knoflíky", type: "arcs", paths: [[[360, 205], [430, 215], [360, 225], [360, 205]], [[360, 280], [360, 285]], [[360, 330], [360, 335]]], strokeColor: "#E76F51" },
        { id: "s4", label: "Větvičkové ruce", type: "arcs", paths: [[[275, 290], [180, 250], [160, 230]], [[445, 290], [540, 250], [560, 230]]], strokeColor: "#8D5B4C" }
      ]
    },
    {
      stars: 2,
      title: "RYCHLÉ AUTÍČKO",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Karoserie a střecha", type: "arcs", paths: [[[190, 310], [190, 250], [270, 250], [320, 170], [460, 170], [510, 250], [550, 250], [550, 310], [190, 310]]], strokeColor: "#E63946" },
        { id: "s2", label: "Okna auta", type: "arcs", paths: [[[290, 240], [330, 185], [380, 185], [380, 240], [290, 240]], [[400, 240], [400, 185], [450, 185], [480, 240], [400, 240]]], strokeColor: "#457B9D" },
        { id: "s3", label: "Přední a zadní kolo", type: "arcs", paths: [[[260, 310], [260, 360], [310, 360], [310, 310]], [[430, 310], [430, 360], [480, 360], [480, 310]]], strokeColor: "#1D3557" },
        { id: "s4", label: "Světla a kliky", type: "arcs", paths: [[[540, 260], [550, 260]], [[340, 260], [360, 260]]], strokeColor: "#FFB703" }
      ]
    },
    {
      stars: 2,
      title: "PLACHETNICE NA MOŘI",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Trup lodičky", type: "arcs", paths: [[[190, 290], [530, 290], [470, 380], [250, 380], [190, 290]]], strokeColor: "#8D5B4C" },
        { id: "s2", label: "Stěžeň a plachta", type: "arcs", paths: [[[360, 80], [360, 290]], [[360, 95], [490, 275], [360, 275], [360, 95]]], strokeColor: "#457B9D" },
        { id: "s3", label: "Přední plachta a vlajka", type: "arcs", paths: [[[350, 110], [230, 275], [350, 275], [350, 110]], [[360, 80], [410, 95], [360, 110]]], strokeColor: "#E63946" },
        { id: "s4", label: "Mořské vlnky", type: "arcs", paths: [[[160, 395], [240, 385], [320, 395], [400, 385], [480, 395], [560, 385]]], strokeColor: "#2A9D8F" }
      ]
    },
    {
      stars: 2,
      title: "BAREVNÝ MOTÝLEK",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Tělo a tykadla", type: "arcs", paths: [[[360, 140], [360, 360]], [[360, 140], [330, 80]], [[360, 140], [390, 80]]], strokeColor: "#1D3557" },
        { id: "s2", label: "Horní velká křídla", type: "arcs", paths: [[[360, 180], [210, 110], [190, 240], [360, 250]], [[360, 180], [510, 110], [530, 240], [360, 250]]], strokeColor: "#E76F51" },
        { id: "s3", label: "Spodní křídla", type: "arcs", paths: [[[360, 250], [240, 350], [360, 330]], [[360, 250], [480, 350], [360, 330]]], strokeColor: "#2A9D8F" },
        { id: "s4", label: "Ozdobné kroužky", type: "circle", cx: 260, cy: 190, r: 24, strokeColor: "#F4A261" }
      ]
    },

    // 3★ DETAILNĚJŠÍ ZVÍŘATA A STROJE (4 KROKY)
    {
      stars: 3,
      title: "ROZTOMILÁ KOČIČKA",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Hlava se špičatýma ušima", type: "arcs", paths: [[[300, 140], [270, 70], [330, 110], [390, 110], [450, 70], [420, 140], [420, 200], [300, 200], [300, 140]]], strokeColor: "#1D3557" },
        { id: "s2", label: "Tělíčko a nohy", type: "arcs", paths: [[[320, 200], [290, 360], [430, 360], [400, 200]]], strokeColor: "#F4A261" },
        { id: "s3", label: "Zatočený ocásek", type: "arcs", paths: [[[420, 340], [510, 310], [520, 240], [490, 230]]], strokeColor: "#E76F51" },
        { id: "s4", label: "Očička a vousky", type: "arcs", paths: [[[335, 160], [340, 160]], [[385, 160], [390, 160]], [[270, 170], [320, 175]], [[445, 170], [400, 175]]], strokeColor: "#1D3557" }
      ]
    },
    {
      stars: 3,
      title: "VĚRNÝ PEJSEK",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Hlava s visícíma ušima", type: "arcs", paths: [[[310, 120], [410, 120], [420, 210], [300, 210], [310, 120]], [[300, 130], [260, 220]], [[420, 130], [460, 220]]], strokeColor: "#8D5B4C" },
        { id: "s2", label: "Tělo pejska", type: "arcs", paths: [[[330, 210], [300, 370], [420, 370], [390, 210]]], strokeColor: "#E9C46A" },
        { id: "s3", label: "Ocásek a obojek", type: "arcs", paths: [[[420, 330], [490, 280], [510, 250]], [[320, 220], [400, 220]]], strokeColor: "#E63946" },
        { id: "s4", label: "Čumák a veselý jazyk", type: "arcs", paths: [[[345, 180], [375, 180]], [[360, 195], [360, 230]]], strokeColor: "#1D3557" }
      ]
    },
    {
      stars: 3,
      title: "VESMÍRNÁ RAKETA",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Trup rakety se špičkou", type: "arcs", paths: [[[310, 340], [310, 180], [360, 80], [410, 180], [410, 340], [310, 340]]], strokeColor: "#1D3557" },
        { id: "s2", label: "Boční křidélka", type: "arcs", paths: [[[310, 280], [230, 370], [310, 350]], [[410, 280], [490, 370], [410, 350]]], strokeColor: "#E63946" },
        { id: "s3", label: "Kulaté okénko", type: "circle", cx: 360, cy: 210, r: 35, strokeColor: "#457B9D" },
        { id: "s4", label: "Ohnivé plameny", type: "arcs", paths: [[[330, 350], [345, 420], [360, 380], [375, 420], [390, 350]]], strokeColor: "#F77F00" }
      ]
    },
    {
      stars: 3,
      title: "PARNÍ LOKOMOTIVA",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Kotel a kabina", type: "arcs", paths: [[[190, 320], [410, 320], [410, 190], [510, 190], [510, 320], [190, 320]]], strokeColor: "#1D3557" },
        { id: "s2", label: "Komín a nárazník", type: "arcs", paths: [[[240, 230], [230, 160], [280, 160], [270, 230]], [[170, 300], [190, 300]]], strokeColor: "#E63946" },
        { id: "s3", label: "Velká a malá kola", type: "circle", cx: 460, cy: 345, r: 42, strokeColor: "#2A9D8F" },
        { id: "s4", label: "Obláčky kouře", type: "arcs", paths: [[[255, 140], [275, 110]], [[275, 95], [310, 70]]], strokeColor: "#457B9D" }
      ]
    },
    {
      stars: 3,
      title: "MLSNÝ MEDVÍDEK",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Hlava s oušky", type: "arcs", paths: [[[310, 130], [270, 90], [290, 140], [430, 140], [450, 90], [410, 130], [420, 200], [300, 200], [310, 130]]], strokeColor: "#8D5B4C" },
        { id: "s2", label: "Baculkaté bříško", type: "ellipse", cx: 360, cy: 280, rx: 95, ry: 90, strokeColor: "#E9C46A" },
        { id: "s3", label: "Tlapky medvídka", type: "arcs", paths: [[[270, 240], [230, 290]], [[450, 240], [490, 290]], [[290, 360], [270, 400]], [[430, 360], [450, 400]]], strokeColor: "#8D5B4C" },
        { id: "s4", label: "Čumáček a oči", type: "circle", cx: 360, cy: 175, r: 18, strokeColor: "#1D3557" }
      ]
    },

    // 4★ SLOŽITĚJŠÍ ŽIVÉ MODELY A SCÉNY (4 KROKY)
    {
      stars: 4,
      title: "ŽABKA NA LEKNÍNU",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Leknínový list", type: "arcs", paths: [[[200, 360], [360, 410], [520, 360], [450, 320], [360, 340], [270, 320], [200, 360]]], strokeColor: "#2A9D8F" },
        { id: "s2", label: "Tělo žabky s očima", type: "arcs", paths: [[[310, 220], [300, 160], [340, 180], [380, 180], [420, 160], [410, 220], [430, 310], [290, 310], [310, 220]]], strokeColor: "#52B788" },
        { id: "s3", label: "Skákací nohy", type: "arcs", paths: [[[290, 270], [220, 320], [260, 350]], [[430, 270], [500, 320], [460, 350]]], strokeColor: "#2D6A4F" },
        { id: "s4", label: "Široký úsměv", type: "arcs", paths: [[[320, 250], [360, 280], [400, 250]]], strokeColor: "#1D3557" }
      ]
    },
    {
      stars: 4,
      title: "DOPRAVNÍ LETADLO",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Trup letadla s ocasem", type: "arcs", paths: [[[170, 240], [510, 220], [560, 140], [540, 220], [510, 250], [170, 250], [170, 240]]], strokeColor: "#1D3557" },
        { id: "s2", label: "Nosná křídla", type: "arcs", paths: [[[320, 230], [260, 110], [330, 110], [380, 230]], [[340, 250], [290, 370], [360, 370], [400, 250]]], strokeColor: "#457B9D" },
        { id: "s3", label: "Proudové motory", type: "arcs", paths: [[[280, 290], [330, 290]]], strokeColor: "#E63946" },
        { id: "s4", label: "Okénka a kokpit", type: "arcs", paths: [[[190, 235], [210, 235]], [[250, 235], [470, 235]]], strokeColor: "#FFB703" }
      ]
    },
    {
      stars: 4,
      title: "MOUDRÁ SOVIČKA",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Větev stromu", type: "arcs", paths: [[[160, 370], [560, 370]]], strokeColor: "#8D5B4C" },
        { id: "s2", label: "Tělo s křídly", type: "ellipse", cx: 360, cy: 235, rx: 110, ry: 130, strokeColor: "#1D3557" },
        { id: "s3", label: "Obrovské soví oči", type: "circle", cx: 320, cy: 195, r: 28, strokeColor: "#F4A261" },
        { id: "s4", label: "Zobáček a peříčka", type: "arcs", paths: [[[350, 220], [360, 245], [370, 220]], [[290, 130], [270, 75], [320, 115]], [[430, 130], [450, 75], [400, 115]]], strokeColor: "#E76F51" }
      ]
    },
    {
      stars: 4,
      title: "JABLÍČKO S ČERVÍKEM",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Kulaté jablíčko", type: "arcs", paths: [[[360, 140], [250, 160], [240, 310], [360, 380], [480, 310], [470, 160], [360, 140]]], strokeColor: "#E63946" },
        { id: "s2", label: "Stopka a lístek", type: "arcs", paths: [[[360, 140], [370, 80]], [[370, 100], [430, 85], [390, 120]]], strokeColor: "#2A9D8F" },
        { id: "s3", label: "Dírka a červík", type: "arcs", paths: [[[410, 250], [470, 220], [460, 180], [430, 190]]], strokeColor: "#52B788" },
        { id: "s4", label: "Očička červíka", type: "circle", cx: 445, cy: 185, r: 6, strokeColor: "#1D3557" }
      ]
    },
    {
      stars: 4,
      title: "ŠNEČEK SE ŠULKEM",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Tělo šnečka", type: "arcs", paths: [[[190, 370], [510, 370], [540, 330], [520, 280], [470, 290]]], strokeColor: "#F4A261" },
        { id: "s2", label: "Tykadla s očima", type: "arcs", paths: [[[510, 280], [510, 200]], [[535, 280], [545, 200]]], strokeColor: "#E76F51" },
        { id: "s3", label: "Zatočená ulita", type: "circle", cx: 330, cy: 260, r: 85, strokeColor: "#8D5B4C" },
        { id: "s4", label: "Spirála v ulitě", type: "arcs", paths: [[[330, 260], [360, 240], [370, 280], [310, 300], [290, 250], [340, 210]]], strokeColor: "#E9C46A" }
      ]
    },

    // 5★ POKROČILÉ KRESBY (4 KROKY)
    {
      stars: 5,
      title: "KRÁLOVSKÝ HRAD",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Hradba s bránou", type: "arcs", paths: [[[250, 230], [470, 230], [470, 390], [250, 390], [250, 230]], [[320, 390], [320, 300], [400, 300], [400, 390]]], strokeColor: "#1D3557" },
        { id: "s2", label: "Dvě vysoké věže", type: "arcs", paths: [[[190, 160], [250, 160], [250, 390], [190, 390], [190, 160]], [[470, 160], [530, 160], [530, 390], [470, 390], [470, 160]]], strokeColor: "#457B9D" },
        { id: "s3", label: "Střechy a vlajky", type: "arcs", paths: [[[180, 160], [220, 80], [260, 160]], [[460, 160], [500, 80], [540, 160]], [[220, 80], [250, 95], [220, 105]], [[500, 80], [530, 95], [500, 105]]], strokeColor: "#E63946" },
        { id: "s4", label: "Cimbuří a střílny", type: "arcs", paths: [[[270, 210], [290, 210], [290, 230], [330, 230], [330, 210], [350, 210]], [[215, 220], [225, 220]], [[495, 220], [505, 220]]], strokeColor: "#FFB703" }
      ]
    },
    {
      stars: 5,
      title: "VELKÝ DINOSAURUS",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Mohutné tělo", type: "arcs", paths: [[[270, 250], [430, 250], [450, 350], [250, 350], [270, 250]]], strokeColor: "#52B788" },
        { id: "s2", label: "Dlouhý krk a hlava", type: "arcs", paths: [[[410, 250], [470, 130], [520, 130], [520, 160], [460, 200], [430, 250]]], strokeColor: "#2D6A4F" },
        { id: "s3", label: "Dlouhý ocas", type: "arcs", paths: [[[270, 270], [170, 320], [140, 340], [250, 340]]], strokeColor: "#40916C" },
        { id: "s4", label: "Čtyři nohy a oko", type: "arcs", paths: [[[280, 350], [280, 410]], [[330, 350], [330, 410]], [[370, 350], [370, 410]], [[420, 350], [420, 410]], [[495, 145], [500, 145]]], strokeColor: "#1B4332" }
      ]
    },
    {
      stars: 5,
      title: "KOSMONAUT VE SKAFANDRU",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Helma kosmonauta", type: "circle", cx: 360, cy: 160, r: 55, strokeColor: "#1D3557" },
        { id: "s2", label: "Zrcadlové hledí", type: "ellipse", cx: 360, cy: 160, rx: 36, ry: 26, strokeColor: "#FFB703" },
        { id: "s3", label: "Skafandr a nohy", type: "arcs", paths: [[[320, 215], [300, 330], [345, 330], [345, 410], [375, 410], [375, 330], [420, 330], [400, 215], [320, 215]]], strokeColor: "#457B9D" },
        { id: "s4", label: "Rukavice a batoh", type: "arcs", paths: [[[310, 240], [240, 280]], [[410, 240], [480, 280]], [[270, 220], [270, 320]], [[450, 220], [450, 320]]], strokeColor: "#E63946" }
      ]
    },
    {
      stars: 5,
      title: "HUDEBNÍ KYTARA",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Tělo kytary", type: "arcs", paths: [[[210, 280], [250, 210], [310, 230], [340, 180], [390, 220], [380, 310], [320, 350], [240, 340], [210, 280]]], strokeColor: "#E76F51" },
        { id: "s2", label: "Krk s pražci", type: "arcs", paths: [[[360, 200], [510, 120]], [[380, 220], [520, 140]]], strokeColor: "#8D5B4C" },
        { id: "s3", label: "Otvor a struny", type: "circle", cx: 300, cy: 270, r: 28, strokeColor: "#1D3557" },
        { id: "s4", label: "Hlava s kolíčky", type: "arcs", paths: [[[510, 120], [560, 90], [570, 110], [520, 140]]], strokeColor: "#FFB703" }
      ]
    },
    {
      stars: 5,
      title: "POHÁDKOVÝ DRAK",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "s1", label: "Dračí tělo s ocasem", type: "arcs", paths: [[[310, 230], [440, 230], [440, 350], [310, 350], [310, 230]], [[310, 320], [180, 350], [150, 380]]], strokeColor: "#2D6A4F" },
        { id: "s2", label: "Dračí hlava a krk", type: "arcs", paths: [[[420, 230], [460, 140], [530, 130], [540, 160], [490, 180], [440, 230]]], strokeColor: "#40916C" },
        { id: "s3", label: "Blanitá křídla", type: "arcs", paths: [[[370, 230], [320, 90], [390, 140], [430, 90], [410, 230]]], strokeColor: "#E76F51" },
        { id: "s4", label: "Ohnivý plamen", type: "arcs", paths: [[[540, 150], [610, 130], [580, 165], [620, 180], [535, 170]]], strokeColor: "#F77F00" }
      ]
    }
  ];

  /* =========================================================================
   * 4. HERNÍ ENGINE: ZÓNA A — KRESLENÍ KROK ZA KROKEM + VYBARVOVÁNÍ
   * ========================================================================= */
  class StepDrawActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.activity = activity;
      this.level = level;
      this.mascot = mascot;
      this.store = store;
      this.onComplete = onComplete;

      const star = Math.max(1, Math.min(5, this.level.stars || 1));
      const pool = REAL_STEP_DRAW_CATALOG.filter((t) => t.stars === star);
      this.allTemplates = shuffleArray(pool.length ? pool : REAL_STEP_DRAW_CATALOG);
      this.templateIdx = 0;

      this.activeColor = "#1D3557";
      this.brushSize = 9;
      this.zoomScale = 1.0;
      this.zoomSteps = [1.0, 1.25, 1.5, 1.8, 2.2];
      this.activeTool = "brush"; // "brush" nebo "bucket"
      this.mixSlots = [null, null];
      this.loadTemplate(this.allTemplates[0]);
    }

    loadTemplate(cfg) {
      this.currentConfig = cfg;
      this.steps = cfg.steps || [];
      this.currentStepIdx = 0;
      this.coloringMode = false;
      this.activeTool = "brush";
      this.isDrawing = false;
      this.checkpoints = [];
      this.hitCount = 0;
      this.lastPt = null;

      this.render();
      this.showFullPatternPreview(true);
      this.prepareStep(0);
    }

    nextTemplate() {
      this.mascot.audio.playSfx("pop");
      this.templateIdx = (this.templateIdx + 1) % this.allTemplates.length;
      if (this.templateIdx === 0) {
        this.allTemplates = shuffleArray(this.allTemplates);
      }
      this.loadTemplate(this.allTemplates[this.templateIdx]);
    }

    setZoom(scale) {
      this.zoomScale = scale;
      const pct = Math.round(scale * 100);
      const badge = document.getElementById("draw-zoom-badge");
      if (badge) badge.textContent = `${pct}%`;
      if (this.canvas) {
        this.canvas.style.transform = `scale(${scale})`;
        this.canvas.style.transformOrigin = "center center";
      }
    }

    render() {
      const cfg = this.currentConfig;
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">✏️ ${cfg.title}</h2>
          <div id="draw-step-pills" class="step-pills"></div>
          <div class="workspace-actions">
            <div class="zoom-stepper" title="Nastavení vzdálenosti / přiblížení plátna">
              <button id="btn-draw-zoom-out" class="btn-touch btn-zoom" aria-label="Oddálit">🔍−</button>
              <span id="draw-zoom-badge" class="zoom-badge">${Math.round(this.zoomScale * 100)}%</span>
              <button id="btn-draw-zoom-in" class="btn-touch btn-zoom" aria-label="Přiblížit zblízka">🔍+</button>
            </div>
            <button id="btn-draw-preview" class="btn-touch btn-secondary" title="Zobrazit vzor">🖼️ VZOR</button>
            <button id="btn-draw-skip-step" class="btn-touch btn-secondary">✨ DALŠÍ KROK</button>
            <button id="btn-draw-finish" class="btn-touch btn-primary ${this.coloringMode ? "" : "hidden"}">✅ HOTOVO A ULOŽIT</button>
          </div>
        </div>
        <div id="step-studio-layout" class="studio-layout">
          <div class="canvas-frame">
            <canvas id="step-draw-canvas" class="draw-canvas" width="${cfg.canvasWidth}" height="${cfg.canvasHeight}" draggable="false" style="touch-action:none; user-select:none; transform:scale(${this.zoomScale}); transform-origin:center center;"></canvas>
          </div>
          <aside class="studio-sidebar">
            <div id="draw-color-tools" class="tool-box ${this.coloringMode ? "" : "hidden"}">
              <div class="tool-box-title">🎨 NÁSTROJ PRO VYBARVENÍ</div>
              <div class="tool-mode-row">
                <button id="btn-draw-tool-brush" class="btn-touch btn-tool-mode ${this.activeTool === "brush" ? "active" : ""}">🖌️ ŠTĚTEC</button>
                <button id="btn-draw-tool-bucket" class="btn-touch btn-tool-mode ${this.activeTool === "bucket" ? "active" : ""}">🪣 PLECHOVKA</button>
              </div>
            </div>

            <div class="tool-box">
              <div class="tool-box-title">✒️ VELIKOST PERA</div>
              ${renderPenSizeMarkup(this.brushSize)}
            </div>

            <div class="tool-box">
              <div class="tool-box-title">🌈 BAREVNÝ RGB KRUH A PALETA</div>
              <div class="rgb-wheel-row">
                <canvas id="step-rgb-wheel" class="rgb-wheel-canvas" width="92" height="92"></canvas>
                <div class="rgb-wheel-info">
                  <div id="step-rgb-preview" class="rgb-preview-dot" style="background:${this.activeColor};"></div>
                  <span>Dotkni se kruhu pro libovolný odstín!</span>
                </div>
              </div>
              <div id="draw-swatches" class="swatch-grid">
                ${EXTENDED_SWATCH_PALETTE.map(
                  (c, i) =>
                    `<button class="btn-touch btn-swatch ${i === 0 ? "active" : ""}" data-color="${c.hex}" data-name="${c.name}" style="background:${c.hex}" aria-label="${c.name}"></button>`
                ).join("")}
              </div>
            </div>

            <div class="tool-box">
              <div class="tool-box-title">🧪 KOUZELNÉ MÍCHÁNÍ BAREV</div>
              <div class="mix-slots">
                <div id="mix-slot-1" class="mix-drop">1</div>
                <span class="mix-plus">+</span>
                <div id="mix-slot-2" class="mix-drop">2</div>
                <span class="mix-plus">=</span>
                <button id="mix-result-btn" class="btn-touch btn-swatch" style="background:#ffffff; border-color:#cbd5e1;" aria-label="Namíchaná barva">✨</button>
              </div>
              <div style="display:flex; gap:5px; flex-wrap:wrap;">
                ${MIX_BASE_COLORS.map(
                  (mc) =>
                    `<button class="btn-touch btn-secondary mix-pick" data-mix="${mc.id}" data-name="${mc.name}" data-hex="${mc.hex}" style="background:${mc.hex}; color:${mc.textColor}; padding:5px 8px; font-size:0.75rem;">${mc.label}</button>`
                ).join("")}
              </div>
            </div>

            <div class="tool-box">
              <div class="tool-box-title">🧹 POMŮCKY</div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button id="btn-canvas-clear" class="btn-touch btn-secondary">🗑️ SMAZAT PLÁTNO</button>
              </div>
            </div>
          </aside>
        </div>
      `;

      this.canvas = document.getElementById("step-draw-canvas");
      this.ctx = this.canvas.getContext("2d");

      this.paintLayer = document.createElement("canvas");
      this.paintLayer.width = cfg.canvasWidth;
      this.paintLayer.height = cfg.canvasHeight;
      this.paintCtx = this.paintLayer.getContext("2d");
      this.paintCtx.fillStyle = "#FFFFFF";
      this.paintCtx.fillRect(0, 0, this.paintLayer.width, this.paintLayer.height);

      this.bindEvents();
    }

    showFullPatternPreview(autoStart = false) {
      const existing = this.hostEl.querySelector(".preview-guide-modal");
      if (existing) existing.remove();

      const cfg = this.currentConfig;
      const modal = document.createElement("div");
      modal.className = "preview-guide-modal";
      modal.innerHTML = `
        <div class="preview-guide-card">
          <h3 style="margin:0; font-size:1.35rem; color:var(--navy);">🖼️ VZOR: ${cfg.title}</h3>
          <p style="margin:0; font-weight:700; color:var(--navy-soft); font-size:0.95rem;">
            Prohlédni si zvětšený obrázek a pak ho nakresli krok za krokem!
          </p>
          <canvas id="preview-guide-canvas" width="${cfg.canvasWidth}" height="${cfg.canvasHeight}" style="width:min(74vw, 560px); height:auto; border-radius:16px; border:3px solid #bae6fd; background:#fff;"></canvas>
          <button class="btn-touch btn-primary btn-close-preview" style="font-size:1.1rem; padding:10px 26px;">✏️ JDEME KRESLIT!</button>
        </div>
      `;
      this.hostEl.appendChild(modal);

      const pCanvas = modal.querySelector("#preview-guide-canvas");
      const pCtx = pCanvas.getContext("2d");
      pCtx.fillStyle = "#FFFFFF";
      pCtx.fillRect(0, 0, pCanvas.width, pCanvas.height);
      (this.steps || []).forEach((st) => {
        this.drawStepShape(pCtx, st, st.strokeColor || "#1D3557", false);
      });

      const closeModal = () => {
        if (modal.parentNode) modal.remove();
      };
      modal.querySelector(".btn-close-preview").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        closeModal();
      });
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
      });
      if (autoStart) {
        setTimeout(closeModal, 3600);
      }
    }

    bindEvents() {
      const getPos = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? this.canvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? this.canvas.height / rect.height : 1;
        return {
          x: (e.clientX - rect.left) * scaleX,
          y: (e.clientY - rect.top) * scaleY
        };
      };

      const drawStrokeSegment = (fromPt, toPt) => {
        this.paintCtx.beginPath();
        this.paintCtx.moveTo(fromPt.x, fromPt.y);
        this.paintCtx.lineTo(toPt.x, toPt.y);
        this.paintCtx.strokeStyle = this.activeColor;
        this.paintCtx.lineWidth = this.brushSize;
        this.paintCtx.lineCap = "round";
        this.paintCtx.lineJoin = "round";
        this.paintCtx.stroke();
      };

      this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      this.canvas.addEventListener("dragstart", (e) => e.preventDefault());

      this.canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch (_err) {}

        const pt = getPos(e);

        if (this.coloringMode && this.activeTool === "bucket") {
          // Plechovka s barvou: flood fill
          floodFillCanvas(this.paintCtx, pt.x, pt.y, this.activeColor);
          this.redraw();
          this.mascot.audio.playSfx("pop");
          return;
        }

        this.isDrawing = true;
        this.lastPt = pt;
        this.paintCtx.beginPath();
        this.paintCtx.arc(this.lastPt.x, this.lastPt.y, this.brushSize / 2, 0, Math.PI * 2);
        this.paintCtx.fillStyle = this.activeColor;
        this.paintCtx.fill();
        this.checkPointHit(this.lastPt);
        this.redraw();
        this.mascot.resetInactivityTimer(() => this.triggerHint());
      });

      this.canvas.addEventListener("pointermove", (e) => {
        if (!this.isDrawing || (this.coloringMode && this.activeTool === "bucket")) {
          if (e.buttons === 1 && (!this.coloringMode || this.activeTool === "brush")) {
            this.isDrawing = true;
            this.lastPt = getPos(e);
          } else {
            return;
          }
        }
        e.preventDefault();
        const pt = getPos(e);
        if (!this.lastPt) this.lastPt = pt;
        drawStrokeSegment(this.lastPt, pt);
        this.checkSegmentHit(this.lastPt, pt);
        this.lastPt = pt;
        this.redraw();
      });

      const endStroke = (e) => {
        if (!this.isDrawing) return;
        if (e && e.pointerId !== undefined) {
          try {
            if (this.canvas.hasPointerCapture(e.pointerId)) {
              this.canvas.releasePointerCapture(e.pointerId);
            }
          } catch (_err) {}
        }
        this.isDrawing = false;
        this.lastPt = null;
        this.evaluateStepProgress();
      };

      this.canvas.addEventListener("pointerup", endStroke);
      this.canvas.addEventListener("pointercancel", endStroke);
      this.canvas.addEventListener("lostpointercapture", endStroke);

      // Zoom Stepper (Nastavení vzdálenosti kreslení)
      document.getElementById("btn-draw-zoom-in").addEventListener("click", () => {
        const next = this.zoomSteps.find((s) => s > this.zoomScale) || this.zoomSteps[this.zoomSteps.length - 1];
        this.setZoom(next);
        this.mascot.audio.playSfx("pop");
      });

      document.getElementById("btn-draw-zoom-out").addEventListener("click", () => {
        const prev = [...this.zoomSteps].reverse().find((s) => s < this.zoomScale) || this.zoomSteps[0];
        this.setZoom(prev);
        this.mascot.audio.playSfx("pop");
      });

      // Přepínání Štětec / Plechovka v režimu vybarvování
      const btnBrush = document.getElementById("btn-draw-tool-brush");
      const btnBucket = document.getElementById("btn-draw-tool-bucket");
      if (btnBrush && btnBucket) {
        btnBrush.addEventListener("click", () => {
          this.activeTool = "brush";
          btnBrush.classList.add("active");
          btnBucket.classList.remove("active");
          this.mascot.audio.playSfx("pop");
        });
        btnBucket.addEventListener("click", () => {
          this.activeTool = "bucket";
          btnBucket.classList.add("active");
          btnBrush.classList.remove("active");
          this.mascot.audio.playSfx("pop");
          this.mascot.audio.speakCustom("Plechovka barvy! Klepni do plochy, kterou chceš vybarvit!");
        });
      }

      // RGB Kruh
      const rgbPreview = document.getElementById("step-rgb-preview");
      mountRgbColorWheel(document.getElementById("step-rgb-wheel"), rgbPreview, (hex) => {
        this.activeColor = hex;
        this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => b.classList.remove("active"));
      });

      // Barvy s hlasovým přečtením
      this.hostEl.querySelectorAll("#draw-swatches .btn-swatch").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.activeColor = btn.dataset.color;
          if (rgbPreview) rgbPreview.style.background = this.activeColor;
          this.mascot.audio.playSfx("pop");
          if (btn.dataset.name) {
            this.mascot.audio.speakCustom(btn.dataset.name);
          }
        });
      });

      // Velikost pera (čisté ikony)
      this.hostEl.querySelectorAll(".btn-pen-size").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.hostEl.querySelectorAll(".btn-pen-size").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.brushSize = Number(btn.dataset.penSize) || 9;
          this.mascot.audio.playSfx("pop");
          if (btn.dataset.spoken) {
            this.mascot.audio.speakCustom(btn.dataset.spoken);
          }
        });
      });

      // Kouzelné míchání barev
      this.hostEl.querySelectorAll(".mix-pick").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.handleColorMixPick({
            id: btn.dataset.mix,
            name: btn.dataset.name,
            hex: btn.dataset.hex
          });
        });
      });

      document.getElementById("btn-draw-preview").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.showFullPatternPreview(false);
      });

      document.getElementById("btn-canvas-clear").addEventListener("click", () => {
        this.paintCtx.fillStyle = "#FFFFFF";
        this.paintCtx.fillRect(0, 0, this.paintLayer.width, this.paintLayer.height);
        this.canvas.classList.remove("alive-bounce");
        this.coloringMode = false;
        this.activeTool = "brush";
        const colorTools = document.getElementById("draw-color-tools");
        if (colorTools) colorTools.classList.add("hidden");
        document.getElementById("btn-draw-finish").classList.add("hidden");
        document.getElementById("btn-draw-skip-step").classList.remove("hidden");
        this.prepareStep(0);
      });

      document.getElementById("btn-draw-skip-step").addEventListener("click", () => {
        this.completeCurrentStep();
      });

      document.getElementById("btn-draw-finish").addEventListener("click", () => {
        this.showCompletionModal();
      });
    }

    showCompletionModal() {
      const dataUrl = this.canvas.toDataURL("image/png");
      this.store.addArtwork(this.currentConfig.title, dataUrl);
      this.mascot.celebrate("celebrate_04");
      this.onComplete();
      showContinueBanner(this.hostEl, {
        icon: "🎨",
        title: `OBRÁZEK „${this.currentConfig.title}“ JE HOTOVÝ!`,
        subtitle: "Tvůj krásně vybarvený výtvor jsme uložili do galerie. Pojďme nakreslit další obrázek!",
        spokenText: `Paráda! Obrázek ${this.currentConfig.title} je hotový! Pojďme na další obrázek!`,
        nextLabel: "▶️ DALŠÍ OBRÁZEK ➔",
        onNext: () => this.nextTemplate()
      });
    }

    handleColorMixPick(colorObj) {
      this.mascot.audio.playSfx("pop");
      const slot1 = document.getElementById("mix-slot-1");
      const slot2 = document.getElementById("mix-slot-2");
      const resBtn = document.getElementById("mix-result-btn");
      const rgbPreview = document.getElementById("step-rgb-preview");

      if (!this.mixSlots[0] || (this.mixSlots[0] && this.mixSlots[1])) {
        this.mixSlots = [colorObj, null];
        slot1.style.background = colorObj.hex;
        slot1.textContent = "";
        slot2.style.background = "#ffffff";
        slot2.textContent = "2";
        return;
      }

      this.mixSlots[1] = colorObj;
      slot2.style.background = colorObj.hex;
      slot2.textContent = "";

      const mixed = mixTwoColors(this.mixSlots[0], this.mixSlots[1]);
      resBtn.style.background = mixed.hex;
      resBtn.textContent = "🎨";
      this.activeColor = mixed.hex;
      if (rgbPreview) rgbPreview.style.background = mixed.hex;
      this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => b.classList.remove("active"));
      resBtn.classList.add("active");
      this.mascot.audio.playSfx("mix");
      this.mascot.emitParticles(["🎨", "✨", "🌈"]);

      if (mixed.audioId) {
        this.mascot.audio.speak(mixed.audioId, null, {
          stateDuringSpeech: "HAPPY",
          stateAfterSpeech: "IDLE"
        });
      } else {
        this.mascot.audio.speakCustom(`Vznikla ${mixed.name}!`);
      }
    }

    buildCheckpointsForStep(step) {
      const pts = [];
      if (step.type === "ellipse") {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
          pts.push({
            x: step.cx + Math.cos(a) * step.rx,
            y: step.cy + Math.sin(a) * step.ry,
            hit: false
          });
        }
      } else if (step.type === "circle") {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
          pts.push({
            x: step.cx + Math.cos(a) * step.r,
            y: step.cy + Math.sin(a) * step.r,
            hit: false
          });
        }
      } else if (step.paths) {
        step.paths.forEach((path) => {
          path.forEach(([x, y]) => pts.push({ x, y, hit: false }));
        });
      }
      return pts;
    }

    checkPointHit(pt) {
      if (this.coloringMode) return;
      for (const cp of this.checkpoints) {
        if (!cp.hit && Math.hypot(cp.x - pt.x, cp.y - pt.y) < 58) {
          cp.hit = true;
          this.hitCount += 1;
        }
      }
    }

    checkSegmentHit(p1, p2) {
      if (this.coloringMode) return;
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const steps = Math.max(1, Math.ceil(dist / 12));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        this.checkPointHit({
          x: p1.x + (p2.x - p1.x) * t,
          y: p1.y + (p2.y - p1.y) * t
        });
      }
    }

    evaluateStepProgress() {
      if (this.coloringMode || !this.checkpoints.length) return;
      const ratio = this.hitCount / this.checkpoints.length;
      if (ratio >= 0.56) {
        this.completeCurrentStep();
      }
    }

    prepareStep(idx) {
      this.currentStepIdx = idx;
      const pillsEl = document.getElementById("draw-step-pills");
      pillsEl.innerHTML = this.steps
        .map((s, i) => {
          const cls = i < idx ? "done" : i === idx ? "current" : "";
          return `<span class="step-pill ${cls}">${i + 1}. ${s.label.toUpperCase()}</span>`;
        })
        .join("");

      const step = this.steps[idx];
      this.checkpoints = this.buildCheckpointsForStep(step);
      this.hitCount = 0;
      this.redraw();

      this.mascot.audio.speakCustom(
        `Krok ${idx + 1}: obtáhni ${step.label}!`,
        `✏️ KROK ${idx + 1}: ${step.label.toUpperCase()}`
      );
      this.mascot.resetInactivityTimer(() => this.triggerHint());
    }

    completeCurrentStep() {
      if (this.coloringMode) return;
      this.mascot.audio.playSfx("snap");
      this.mascot.emitParticles(["✨", "⭐"]);

      if (this.currentStepIdx + 1 < this.steps.length) {
        this.prepareStep(this.currentStepIdx + 1);
      } else {
        // Dokončen obrys: Přechod do vybarvování!
        this.coloringMode = true;
        this.currentStepIdx = this.steps.length;
        const pillsEl = document.getElementById("draw-step-pills");
        pillsEl.innerHTML = `<span class="step-pill done">🎨 SKVĚLÉ! TEĎ SI MŮŽEŠ OBRÁZEK VYBARVIT ŠTĚTCEM NEBO PLECHOVKOU!</span>`;

        const colorTools = document.getElementById("draw-color-tools");
        if (colorTools) colorTools.classList.remove("hidden");
        document.getElementById("btn-draw-skip-step").classList.add("hidden");
        document.getElementById("btn-draw-finish").classList.remove("hidden");
        this.canvas.classList.add("alive-bounce");
        this.redraw();

        this.mascot.audio.speakCustom(
          "Výborně! Celý obrys je hotový! Teď si můžeš obrázek krásně vybarvit štětcem nebo plechovkou barvy!",
          "🎨 VYBARVI SI SVŮJ OBRÁZEK!"
        );
      }
    }

    triggerHint() {
      if (this.coloringMode) return;
      this.mascot.gentleNudge("hint_draw_trace", null, true);
    }

    drawStepShape(ctx, step, colorOverride = null, dashed = true) {
      ctx.save();
      ctx.strokeStyle = colorOverride || "rgba(76, 201, 240, 0.78)";
      ctx.lineWidth = dashed ? 5 : 6;
      if (dashed) {
        ctx.setLineDash([14, 12]);
      }

      if (step.type === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(step.cx, step.cy, step.rx, step.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (step.type === "circle") {
        ctx.beginPath();
        ctx.arc(step.cx, step.cy, step.r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (step.paths) {
        step.paths.forEach((pts) => {
          if (pts.length === 2 && Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) < 12) {
            ctx.beginPath();
            ctx.arc(pts[0][0], pts[0][1], 7, 0, Math.PI * 2);
            ctx.fillStyle = colorOverride || "rgba(76, 201, 240, 0.78)";
            ctx.fill();
            return;
          }
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i][0], pts[i][1]);
          }
          ctx.stroke();
        });
      }
      ctx.restore();
    }

    redraw() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Kresba dítěte
      ctx.drawImage(this.paintLayer, 0, 0);

      // Tečkovaná nápověda pouze pro právě kreslený krok
      if (!this.coloringMode && this.currentStepIdx < this.steps.length) {
        this.drawStepShape(ctx, this.steps[this.currentStepIdx]);
      }
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  /* =========================================================================
   * 5. HERNÍ ENGINE: ZÓNA A — SYMETRIE A ZRCADLENÍ (25 MOTIVŮ)
   * ========================================================================= */
  const SYMMETRY_MOTIFS = [
    { motif: "butterfly", title: "DOKRESLI MOTÝLKA", emoji: "🦋" },
    { motif: "snowflake", title: "LEDOVÁ VLOČKA", emoji: "❄️" },
    { motif: "crown", title: "KRÁLOVSKÁ KORUNA", emoji: "👑" },
    { motif: "heart", title: "KOUZELNÉ SRDÍČKO", emoji: "❤️" },
    { motif: "ladybug", title: "VESELÁ BERUŠKA", emoji: "🐞" },
    { motif: "flower", title: "ROZKVETLÁ KYTIČKA", emoji: "🌸" },
    { motif: "star", title: "ZÁŘIVÁ HVĚZDIČKA", emoji: "⭐" },
    { motif: "tree", title: "ZELENÝ STROMEČEK", emoji: "🌲" },
    { motif: "diamond", title: "TŘPYTIVÝ DIAMANT", emoji: "💎" },
    { motif: "bell", title: "ZLATÝ ZVONEČEK", emoji: "🔔" },
    { motif: "shield", title: "RYTÍŘSKÝ ŠTÍT", emoji: "🛡️" },
    { motif: "kite", title: "PAPÍROVÝ DRAK", emoji: "🪁" },
    { motif: "rocket", title: "VESMÍRNÁ RAKETA", emoji: "🚀" },
    { motif: "owl", title: "MOUDRÁ SOVIČKA", emoji: "🦉" },
    { motif: "cat", title: "KOČIČÍ HLAVIČKA", emoji: "🐱" },
    { motif: "bear", title: "MEDVÍDEK PÚ", emoji: "🐻" },
    { motif: "frog", title: "VESELÁ ŽABIČKA", emoji: "🐸" },
    { motif: "apple", title: "ČERVENÉ JABLÍČKO", emoji: "🍎" },
    { motif: "leaf", title: "PODZIMNÍ LÍSTEK", emoji: "🍁" },
    { motif: "mushroom", title: "LESNÍ HŘÍBEK", emoji: "🍄" },
    { motif: "balloon", title: "POUŤOVÝ BALÓNEK", emoji: "🎈" },
    { motif: "cupcake", title: "SLADKÝ DORTÍK", emoji: "🧁" },
    { motif: "house", title: "POHÁDKOVÝ DOMEK", emoji: "🏠" },
    { motif: "guitar", title: "HUDEBNÍ KYTARA", emoji: "🎸" },
    { motif: "penguin", title: "TUČŇÁK PIKO", emoji: "🐧" }
  ];

  class SymmetryDrawActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.store = store;
      this.onComplete = onComplete;

      this.deck = shuffleArray(SYMMETRY_MOTIFS);
      this.motifIdx = 0;
      this.autoMirror = level.stars <= 3;
      this.activeColor = "#FF5D8F";
      this.brushSize = 9;
      this.isZoomed = false;
      this.isDrawing = false;
      this.lastPt = null;
      this.showGuide = true;

      this.loadMotif(0);
    }

    currentMotif() {
      return this.deck[this.motifIdx] || this.deck[0];
    }

    loadMotif(idx) {
      this.motifIdx = idx % this.deck.length;
      if (this.motifIdx === 0 && idx > 0) {
        this.deck = shuffleArray(this.deck);
      }
      this.showGuide = true;
      this.render();
      this.redraw();
      const m = this.currentMotif();
      this.mascot.audio.speakCustom(
        `Zrcadlové kreslení: ${m.title}! Kresli na plátno a sleduj zrcadlový obraz!`,
        `🦋 ${m.title}`
      );
    }

    nextMotif() {
      this.mascot.audio.playSfx("pop");
      this.loadMotif(this.motifIdx + 1);
    }

    render() {
      const m = this.currentMotif();
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">${m.emoji} ${m.title}</h2>
          <div class="workspace-actions">
            <button id="btn-sym-zoom" class="btn-touch btn-secondary">🔍 ${this.isZoomed ? "ZMENŠIT" : "ZVĚTŠIT"}</button>
            <button id="btn-sym-toggle" class="btn-touch btn-secondary">🪞 ZRCADLO: ${this.autoMirror ? "ZAP" : "VYP"}</button>
            <button id="btn-sym-clear" class="btn-touch btn-secondary">SMAZAT</button>
            <button id="btn-sym-done" class="btn-touch btn-primary">✅ HOTOVO</button>
          </div>
        </div>
        <div id="sym-studio-layout" class="studio-layout ${this.isZoomed ? "studio-zoomed" : ""}">
          <div class="canvas-frame">
            <canvas id="sym-canvas" class="draw-canvas" width="760" height="460" draggable="false" style="touch-action:none; user-select:none;"></canvas>
          </div>
          <aside class="studio-sidebar">
            <div class="tool-box">
              <div class="tool-box-title">✒️ VELIKOST PERA</div>
              ${renderPenSizeMarkup(this.brushSize)}
            </div>
            <div class="tool-box">
              <div class="tool-box-title">🌈 RGB KRUH A PALETA BAREV</div>
              <div class="rgb-wheel-row">
                <canvas id="sym-rgb-wheel" class="rgb-wheel-canvas" width="92" height="92"></canvas>
                <div class="rgb-wheel-info">
                  <div id="sym-rgb-preview" class="rgb-preview-dot" style="background:${this.activeColor};"></div>
                  <span>Vyber libovolnou barvu na kruhu!</span>
                </div>
              </div>
              <div class="swatch-grid">
                ${EXTENDED_SWATCH_PALETTE.map(
                  (c, idx) =>
                    `<button class="btn-touch btn-swatch ${idx === 7 ? "active" : ""}" data-hex="${c.hex}" data-name="${c.name}" style="background:${c.hex}"></button>`
                ).join("")}
              </div>
            </div>
          </aside>
        </div>
      `;

      this.canvas = document.getElementById("sym-canvas");
      this.ctx = this.canvas.getContext("2d");

      this.paintLayer = document.createElement("canvas");
      this.paintLayer.width = 760;
      this.paintLayer.height = 460;
      this.paintCtx = this.paintLayer.getContext("2d");

      const getPos = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? this.canvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? this.canvas.height / rect.height : 1;
        return {
          x: (e.clientX - rect.left) * scaleX,
          y: (e.clientY - rect.top) * scaleY
        };
      };

      const drawSegment = (p1, p2) => {
        this.paintCtx.beginPath();
        this.paintCtx.moveTo(p1.x, p1.y);
        this.paintCtx.lineTo(p2.x, p2.y);
        this.paintCtx.strokeStyle = this.activeColor;
        this.paintCtx.lineWidth = this.brushSize;
        this.paintCtx.lineCap = "round";
        this.paintCtx.lineJoin = "round";
        this.paintCtx.stroke();

        if (this.autoMirror) {
          const w = this.canvas.width;
          this.paintCtx.beginPath();
          this.paintCtx.moveTo(w - p1.x, p1.y);
          this.paintCtx.lineTo(w - p2.x, p2.y);
          this.paintCtx.strokeStyle = this.activeColor;
          this.paintCtx.lineWidth = this.brushSize;
          this.paintCtx.lineCap = "round";
          this.paintCtx.lineJoin = "round";
          this.paintCtx.stroke();
        }
        this.redraw();
      };

      this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      this.canvas.addEventListener("dragstart", (e) => e.preventDefault());

      this.canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch (_err) {}
        this.isDrawing = true;
        this.lastPt = getPos(e);
        drawSegment(this.lastPt, { x: this.lastPt.x + 0.1, y: this.lastPt.y + 0.1 });
      });

      this.canvas.addEventListener("pointermove", (e) => {
        if (!this.isDrawing) {
          if (e.buttons === 1) {
            this.isDrawing = true;
            this.lastPt = getPos(e);
          } else {
            return;
          }
        }
        e.preventDefault();
        const pt = getPos(e);
        if (!this.lastPt) this.lastPt = pt;
        drawSegment(this.lastPt, pt);
        this.lastPt = pt;
      });

      const stopSymDraw = (e) => {
        if (!this.isDrawing) return;
        if (e && e.pointerId !== undefined) {
          try {
            if (this.canvas.hasPointerCapture(e.pointerId)) {
              this.canvas.releasePointerCapture(e.pointerId);
            }
          } catch (_err) {}
        }
        this.isDrawing = false;
        this.lastPt = null;
      };

      this.canvas.addEventListener("pointerup", stopSymDraw);
      this.canvas.addEventListener("pointercancel", stopSymDraw);
      this.canvas.addEventListener("lostpointercapture", stopSymDraw);

      const rgbPreview = document.getElementById("sym-rgb-preview");
      mountRgbColorWheel(document.getElementById("sym-rgb-wheel"), rgbPreview, (hex) => {
        this.activeColor = hex;
        this.hostEl.querySelectorAll(".btn-swatch").forEach((x) => x.classList.remove("active"));
      });

      this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => {
        b.addEventListener("click", () => {
          this.hostEl.querySelectorAll(".btn-swatch").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          this.activeColor = b.dataset.hex;
          if (rgbPreview) rgbPreview.style.background = this.activeColor;
          this.mascot.audio.playSfx("pop");
          if (b.dataset.name) this.mascot.audio.speakCustom(b.dataset.name);
        });
      });

      this.hostEl.querySelectorAll(".btn-pen-size").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.hostEl.querySelectorAll(".btn-pen-size").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.brushSize = Number(btn.dataset.penSize) || 9;
          this.mascot.audio.playSfx("pop");
          if (btn.dataset.spoken) this.mascot.audio.speakCustom(btn.dataset.spoken);
        });
      });

      document.getElementById("btn-sym-zoom").addEventListener("click", (e) => {
        this.isZoomed = !this.isZoomed;
        const layout = document.getElementById("sym-studio-layout");
        if (layout) layout.classList.toggle("studio-zoomed", this.isZoomed);
        e.currentTarget.textContent = `🔍 ${this.isZoomed ? "ZMENŠIT" : "ZVĚTŠIT"}`;
        this.mascot.audio.playSfx("pop");
      });

      document.getElementById("btn-sym-toggle").addEventListener("click", (e) => {
        this.autoMirror = !this.autoMirror;
        e.currentTarget.textContent = `🪞 ZRCADLO: ${this.autoMirror ? "ZAP" : "VYP"}`;
        this.mascot.audio.playSfx("pop");
      });

      document.getElementById("btn-sym-clear").addEventListener("click", () => {
        this.paintCtx.clearRect(0, 0, this.paintLayer.width, this.paintLayer.height);
        this.showGuide = true;
        this.redraw();
        this.mascot.audio.playSfx("pop");
      });

      document.getElementById("btn-sym-done").addEventListener("click", () => {
        // Skryjeme nápovědu, aby na plátně zůstalo jen čisté pozadí a to, co uživatel nakreslil
        this.showGuide = false;
        this.redraw();
        this.store.addArtwork(this.currentMotif().title, this.canvas.toDataURL("image/png"));
        this.mascot.celebrate(this.level.successAudioId || "symmetry_done");
        this.onComplete();
        showContinueBanner(this.hostEl, {
          icon: this.currentMotif().emoji,
          title: `NÁDHERNÁ SYMETRIE: ${this.currentMotif().title}!`,
          subtitle: "Obrázek je uložen. Pokračuj na další souměrný vzor!",
          spokenText: `Nádherná symetrie! ${this.currentMotif().title} je hotový! Pojďme na další vzor!`,
          nextLabel: "▶️ DALŠÍ VZOR ➔",
          onNext: () => this.nextMotif()
        });
      });
    }

    redraw() {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const cx = w / 2;

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, w, h);

      if (this.showGuide) {
        ctx.save();
        ctx.strokeStyle = "rgba(76, 201, 240, 0.7)";
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 10]);
        ctx.beginPath();
        ctx.moveTo(cx, 20);
        ctx.lineTo(cx, h - 20);
        ctx.stroke();

        // Jemný vodící stín uprostřed, který se nepře s kresbou a po dokončení zmizí
        ctx.font = "160px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = 0.14;
        ctx.fillText(this.currentMotif().emoji, cx, h / 2);
        ctx.restore();
      }

      // Pouze to, co nakreslil uživatel
      ctx.drawImage(this.paintLayer, 0, 0);
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  /* =========================================================================
   * 6. HERNÍ ENGINE: ZÓNA B — STAVITEL Z TVARŮ (TANGRAM - 25 STAVEB)
   * ========================================================================= */
  function buildExtraTangramBlueprints() {
    const items = [
      { title: "POLÁRNÍ STROMEČEK", pieces: [
        { id: "p1", shape: "triangle", color: "#06D6A0", size: 95, targetX: 250, targetY: 95, targetRot: 0, label: "Špička" },
        { id: "p2", shape: "triangle", color: "#2A9D8F", size: 120, targetX: 250, targetY: 185, targetRot: 0, label: "Větve" },
        { id: "p3", shape: "square", color: "#8D6E63", size: 70, targetX: 250, targetY: 280, targetRot: 0, label: "Kmen" },
        { id: "p4", shape: "circle", color: "#FFD166", size: 46, targetX: 250, targetY: 38, targetRot: 0, label: "Hvězda" }
      ]},
      { title: "VESELÝ SNĚHULÁK", pieces: [
        { id: "p1", shape: "circle", color: "#4CC9F0", size: 125, targetX: 250, targetY: 295, targetRot: 0, label: "Spodní koule" },
        { id: "p2", shape: "circle", color: "#90E0EF", size: 95, targetX: 250, targetY: 195, targetRot: 0, label: "Bříško" },
        { id: "p3", shape: "circle", color: "#CAF0F8", size: 68, targetX: 250, targetY: 120, targetRot: 0, label: "Hlava" },
        { id: "p4", shape: "triangle", color: "#FF595E", size: 72, targetX: 250, targetY: 62, targetRot: 0, label: "Čepička" }
      ]},
      { title: "POLÁRNÍ VLÁČEK", pieces: [
        { id: "p1", shape: "square", color: "#FF595E", size: 96, targetX: 165, targetY: 195, targetRot: 0, label: "Kabina" },
        { id: "p2", shape: "square", color: "#1982C4", size: 96, targetX: 261, targetY: 195, targetRot: 0, label: "Motor" },
        { id: "p3", shape: "triangle", color: "#FFCA3A", size: 96, targetX: 165, targetY: 99, targetRot: 0, label: "Stříška" },
        { id: "p4", shape: "circle", color: "#2B2D42", size: 66, targetX: 165, targetY: 280, targetRot: 0, label: "Zadní kolo" },
        { id: "p5", shape: "circle", color: "#2B2D42", size: 66, targetX: 265, targetY: 280, targetRot: 0, label: "Přední kolo" }
      ]},
      { title: "KRÁLOVSKÝ HRAD", pieces: [
        { id: "p1", shape: "square", color: "#FFB703", size: 110, targetX: 235, targetY: 255, targetRot: 0, label: "Hradba" },
        { id: "p2", shape: "square", color: "#F77F00", size: 76, targetX: 140, targetY: 272, targetRot: 0, label: "Levá věž" },
        { id: "p3", shape: "square", color: "#F77F00", size: 76, targetX: 330, targetY: 272, targetRot: 0, label: "Pravá věž" },
        { id: "p4", shape: "triangle", color: "#E63946", size: 84, targetX: 140, targetY: 192, targetRot: 0, label: "Levá střecha" },
        { id: "p5", shape: "triangle", color: "#E63946", size: 84, targetX: 330, targetY: 192, targetRot: 0, label: "Pravá střecha" }
      ]},
      { title: "RYCHLÁ PLACHETNICE", pieces: [
        { id: "p1", shape: "square", color: "#8D6E63", size: 92, targetX: 200, targetY: 295, targetRot: 0, label: "Levý trup" },
        { id: "p2", shape: "square", color: "#8D6E63", size: 92, targetX: 292, targetY: 295, targetRot: 0, label: "Pravý trup" },
        { id: "p3", shape: "triangle", color: "#4CC9F0", size: 120, targetX: 245, targetY: 180, targetRot: 0, label: "Plachta" },
        { id: "p4", shape: "circle", color: "#FFD166", size: 54, targetX: 130, targetY: 95, targetRot: 0, label: "Sluníčko" }
      ]},
      { title: "ROZKVETLÁ KYTIČKA", pieces: [
        { id: "p1", shape: "circle", color: "#FFD166", size: 80, targetX: 240, targetY: 165, targetRot: 0, label: "Střed" },
        { id: "p2", shape: "circle", color: "#FF5D8F", size: 64, targetX: 170, targetY: 165, targetRot: 0, label: "Levý lístek" },
        { id: "p3", shape: "circle", color: "#FF5D8F", size: 64, targetX: 310, targetY: 165, targetRot: 0, label: "Pravý lístek" },
        { id: "p4", shape: "circle", color: "#FF5D8F", size: 64, targetX: 240, targetY: 95, targetRot: 0, label: "Horní lístek" },
        { id: "p5", shape: "square", color: "#06D6A0", size: 78, targetX: 240, targetY: 275, targetRot: 0, label: "Stonek" }
      ]},
      { title: "CHYTRÝ ROBŮTEK", pieces: [
        { id: "p1", shape: "square", color: "#4CC9F0", size: 115, targetX: 240, targetY: 245, targetRot: 0, label: "Tělo robota" },
        { id: "p2", shape: "square", color: "#90E0EF", size: 80, targetX: 240, targetY: 140, targetRot: 0, label: "Hlava robota" },
        { id: "p3", shape: "triangle", color: "#FFB703", size: 56, targetX: 240, targetY: 72, targetRot: 0, label: "Anténa" },
        { id: "p4", shape: "circle", color: "#1D3557", size: 58, targetX: 195, targetY: 330, targetRot: 0, label: "Levé kolo" },
        { id: "p5", shape: "circle", color: "#1D3557", size: 58, targetX: 285, targetY: 330, targetRot: 0, label: "Pravé kolo" }
      ]},
      { title: "SLADKÁ ZMRZLINA", pieces: [
        { id: "p1", shape: "triangle", color: "#F77F00", size: 115, targetX: 245, targetY: 285, targetRot: 180, label: "Kornoutek" },
        { id: "p2", shape: "circle", color: "#FF5D8F", size: 95, targetX: 210, targetY: 190, targetRot: 0, label: "Jahodový kopeček" },
        { id: "p3", shape: "circle", color: "#FFD166", size: 95, targetX: 280, targetY: 190, targetRot: 0, label: "Vanilkový kopeček" },
        { id: "p4", shape: "circle", color: "#E63946", size: 46, targetX: 245, targetY: 115, targetRot: 0, label: "Třešnička" }
      ]},
      { title: "MODRÝ MOTÝLEK", pieces: [
        { id: "p1", shape: "square", color: "#1D3557", size: 65, targetX: 245, targetY: 210, targetRot: 0, label: "Tělíčko" },
        { id: "p2", shape: "triangle", color: "#4CC9F0", size: 105, targetX: 165, targetY: 165, targetRot: 0, label: "Levé horní křídlo" },
        { id: "p3", shape: "triangle", color: "#4CC9F0", size: 105, targetX: 325, targetY: 165, targetRot: 0, label: "Pravé horní křídlo" },
        { id: "p4", shape: "circle", color: "#FF5D8F", size: 72, targetX: 175, targetY: 265, targetRot: 0, label: "Levé dolní křídlo" },
        { id: "p5", shape: "circle", color: "#FF5D8F", size: 72, targetX: 315, targetY: 265, targetRot: 0, label: "Pravé dolní křídlo" }
      ]},
      { title: "MORSKÁ RYBIČKA", pieces: [
        { id: "p1", shape: "square", color: "#FFB703", size: 105, targetX: 225, targetY: 215, targetRot: 0, label: "Tělo ryby" },
        { id: "p2", shape: "triangle", color: "#F77F00", size: 95, targetX: 135, targetY: 215, targetRot: 270, label: "Hlava ryby" },
        { id: "p3", shape: "triangle", color: "#E63946", size: 88, targetX: 318, targetY: 215, targetRot: 90, label: "Ocásek" },
        { id: "p4", shape: "circle", color: "#4CC9F0", size: 44, targetX: 165, targetY: 115, targetRot: 0, label: "Bublinka" }
      ]},
      { title: "POHÁDKOVÁ VĚŽ", pieces: [
        { id: "p1", shape: "square", color: "#90E0EF", size: 96, targetX: 245, targetY: 305, targetRot: 0, label: "Základna" },
        { id: "p2", shape: "square", color: "#4CC9F0", size: 86, targetX: 245, targetY: 214, targetRot: 0, label: "Střed věže" },
        { id: "p3", shape: "triangle", color: "#7209B7", size: 100, targetX: 245, targetY: 120, targetRot: 0, label: "Špičatá střecha" },
        { id: "p4", shape: "circle", color: "#FFD166", size: 46, targetX: 245, targetY: 214, targetRot: 0, label: "Hodiny" }
      ]},
      { title: "VESELÁ HOUSENKA", pieces: [
        { id: "p1", shape: "circle", color: "#06D6A0", size: 78, targetX: 125, targetY: 230, targetRot: 0, label: "Hlavička" },
        { id: "p2", shape: "circle", color: "#2A9D8F", size: 74, targetX: 198, targetY: 245, targetRot: 0, label: "První článek" },
        { id: "p3", shape: "circle", color: "#06D6A0", size: 74, targetX: 270, targetY: 230, targetRot: 0, label: "Druhý článek" },
        { id: "p4", shape: "circle", color: "#2A9D8F", size: 70, targetX: 340, targetY: 245, targetRot: 0, label: "Ocásek" }
      ]},
      { title: "NÁKLADNÍ AUTO", pieces: [
        { id: "p1", shape: "square", color: "#E63946", size: 85, targetX: 155, targetY: 225, targetRot: 0, label: "Kabina" },
        { id: "p2", shape: "square", color: "#FFB703", size: 110, targetX: 265, targetY: 212, targetRot: 0, label: "Korba" },
        { id: "p3", shape: "circle", color: "#1D3557", size: 62, targetX: 165, targetY: 295, targetRot: 0, label: "Přední kolo" },
        { id: "p4", shape: "circle", color: "#1D3557", size: 62, targetX: 280, targetY: 295, targetRot: 0, label: "Zadní kolo" }
      ]},
      { title: "LESNÍ HŘÍBEK", pieces: [
        { id: "p1", shape: "square", color: "#F4A261", size: 88, targetX: 245, targetY: 280, targetRot: 0, label: "Nožička" },
        { id: "p2", shape: "triangle", color: "#E63946", size: 135, targetX: 245, targetY: 170, targetRot: 0, label: "Klobouček" },
        { id: "p3", shape: "circle", color: "#FFFFFF", size: 42, targetX: 225, targetY: 185, targetRot: 0, label: "Levá tečka" },
        { id: "p4", shape: "circle", color: "#FFFFFF", size: 42, targetX: 270, targetY: 185, targetRot: 0, label: "Pravá tečka" }
      ]},
      { title: "ZLATÁ KORUNKA", pieces: [
        { id: "p1", shape: "square", color: "#FFD166", size: 88, targetX: 195, targetY: 260, targetRot: 0, label: "Levá část" },
        { id: "p2", shape: "square", color: "#FFD166", size: 88, targetX: 283, targetY: 260, targetRot: 0, label: "Pravá část" },
        { id: "p3", shape: "triangle", color: "#F77F00", size: 82, targetX: 195, targetY: 175, targetRot: 0, label: "Levý hrot" },
        { id: "p4", shape: "triangle", color: "#F77F00", size: 82, targetX: 283, targetY: 175, targetRot: 0, label: "Pravý hrot" }
      ]},
      { title: "LETADÉLKO KÁNĚ", pieces: [
        { id: "p1", shape: "square", color: "#118AB2", size: 90, targetX: 245, targetY: 215, targetRot: 0, label: "Trup" },
        { id: "p2", shape: "triangle", color: "#4CC9F0", size: 95, targetX: 245, targetY: 122, targetRot: 0, label: "Špička" },
        { id: "p3", shape: "triangle", color: "#FFD166", size: 88, targetX: 155, targetY: 215, targetRot: 0, label: "Levé křídlo" },
        { id: "p4", shape: "triangle", color: "#FFD166", size: 88, targetX: 335, targetY: 215, targetRot: 0, label: "Pravé křídlo" }
      ]},
      { title: "POLÁRNÍ IGLÚ", pieces: [
        { id: "p1", shape: "circle", color: "#CAF0F8", size: 145, targetX: 245, targetY: 235, targetRot: 0, label: "Kupole iglú" },
        { id: "p2", shape: "square", color: "#90E0EF", size: 78, targetX: 155, targetY: 268, targetRot: 0, label: "Vchod" },
        { id: "p3", shape: "circle", color: "#FFD166", size: 56, targetX: 345, targetY: 105, targetRot: 0, label: "Sluníčko" }
      ]},
      { title: "HUDEBNÍ BUBÍNEK", pieces: [
        { id: "p1", shape: "square", color: "#E63946", size: 115, targetX: 245, targetY: 245, targetRot: 0, label: "Buben" },
        { id: "p2", shape: "circle", color: "#FFD166", size: 52, targetX: 195, targetY: 145, targetRot: 0, label: "Levá palička" },
        { id: "p3", shape: "circle", color: "#FFD166", size: 52, targetX: 295, targetY: 145, targetRot: 0, label: "Pravá palička" },
        { id: "p4", shape: "triangle", color: "#4CC9F0", size: 70, targetX: 245, targetY: 245, targetRot: 0, label: "Ozdoba" }
      ]},
      { title: "KOČIČKA MÍCA", pieces: [
        { id: "p1", shape: "circle", color: "#F4A261", size: 115, targetX: 245, targetY: 235, targetRot: 0, label: "Hlava kočičky" },
        { id: "p2", shape: "triangle", color: "#E76F51", size: 65, targetX: 195, targetY: 150, targetRot: 0, label: "Levé ouško" },
        { id: "p3", shape: "triangle", color: "#E76F51", size: 65, targetX: 295, targetY: 150, targetRot: 0, label: "Pravé ouško" },
        { id: "p4", shape: "triangle", color: "#FF5D8F", size: 42, targetX: 245, targetY: 240, targetRot: 180, label: "Čumáček" }
      ]},
      { title: "PEJSEK BARYK", pieces: [
        { id: "p1", shape: "square", color: "#8D6E63", size: 110, targetX: 245, targetY: 235, targetRot: 0, label: "Hlava pejska" },
        { id: "p2", shape: "triangle", color: "#6D4C41", size: 72, targetX: 170, targetY: 205, targetRot: 0, label: "Levé ucho" },
        { id: "p3", shape: "triangle", color: "#6D4C41", size: 72, targetX: 320, targetY: 205, targetRot: 0, label: "Pravé ucho" },
        { id: "p4", shape: "circle", color: "#1D3557", size: 44, targetX: 245, targetY: 255, targetRot: 0, label: "Čumák" }
      ]},
      { title: "BAREVNÝ ŠAŠEK", pieces: [
        { id: "p1", shape: "circle", color: "#FFE5D9", size: 105, targetX: 245, targetY: 255, targetRot: 0, label: "Tvář šaška" },
        { id: "p2", shape: "triangle", color: "#7209B7", size: 105, targetX: 245, targetY: 145, targetRot: 0, label: "Čepice" },
        { id: "p3", shape: "circle", color: "#FFD166", size: 44, targetX: 245, targetY: 82, targetRot: 0, label: "Rolnička" },
        { id: "p4", shape: "circle", color: "#E63946", size: 42, targetX: 245, targetY: 255, targetRot: 0, label: "Červený nos" }
      ]},
      { title: "VÁNOČNÍ DÁREK", pieces: [
        { id: "p1", shape: "square", color: "#E63946", size: 125, targetX: 245, targetY: 265, targetRot: 0, label: "Krabice" },
        { id: "p2", shape: "triangle", color: "#FFD166", size: 75, targetX: 210, targetY: 175, targetRot: 0, label: "Levá mašle" },
        { id: "p3", shape: "triangle", color: "#FFD166", size: 75, targetX: 280, targetY: 175, targetRot: 0, label: "Pravá mašle" },
        { id: "p4", shape: "circle", color: "#F77F00", size: 46, targetX: 245, targetY: 185, targetRot: 0, label: "Střed mašle" }
      ]}
    ];

    const startPositions = [
      [500, 85], [585, 85], [500, 195], [585, 195], [540, 315]
    ];

    return items.map((it) => ({
      title: it.title,
      snapTolerance: 36,
      allowRotation: false,
      pieces: it.pieces.map((p, idx) => ({
        ...p,
        startX: startPositions[idx % startPositions.length][0],
        startY: startPositions[idx % startPositions.length][1],
        startRot: 0
      }))
    }));
  }

  const EXTRA_TANGRAM_TEMPLATES = buildExtraTangramBlueprints();

  class TangramActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.activity = activity;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;

      this.allBlueprints = shuffleArray([
        ...(activity.levels || []).map((l) => l.config),
        ...EXTRA_TANGRAM_TEMPLATES
      ]);
      this.blueprintIdx = 0;

      this.loadBlueprint(this.allBlueprints[0]);
    }

    loadBlueprint(cfg) {
      const stars = this.level.stars || 1;
      const allowRotation = stars >= 3 || Boolean(cfg.allowRotation);
      this.currentCfg = { ...cfg, allowRotation };

      this.pieces = (cfg.pieces || []).map((p, idx) => {
        const canRot = allowRotation && p.shape !== "circle" && p.shape !== "square";
        const startRot = canRot && idx % 2 === 0 ? ((p.targetRot || 0) + 90) % 360 : p.targetRot || 0;
        return {
          ...p,
          curX: p.startX,
          curY: p.startY,
          curRot: startRot,
          locked: false
        };
      });
      this.selectedId = this.pieces[0] ? this.pieces[0].id : null;
      this.mistakes = 0;
      this.hintSlotId = null;
      this.dragState = null;

      this.render();
      this.mascot.audio.speakCustom(
        `Postav obrázek z tvarů: ${cfg.title}! Můžeš dávat dílky v libovolném pořadí!`,
        `🔷 POSTAV: ${cfg.title}`
      );
      this.mascot.resetInactivityTimer(() => this.triggerHint());
    }

    nextBlueprint() {
      this.mascot.audio.playSfx("pop");
      this.blueprintIdx = (this.blueprintIdx + 1) % this.allBlueprints.length;
      if (this.blueprintIdx === 0) {
        this.allBlueprints = shuffleArray(this.allBlueprints);
      }
      this.loadBlueprint(this.allBlueprints[this.blueprintIdx]);
    }

    render() {
      const allowRot = this.currentCfg.allowRotation;
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🔷 ${this.currentCfg.title}</h2>
          <div class="tangram-controls">
            <span class="step-pill current" id="tangram-progress">SLOŽENO: 0 / ${this.pieces.length}</span>
            ${
              allowRot
                ? `<button id="btn-tangram-rotate" class="btn-touch btn-primary">🔄 OTOČIT DÍLEK</button>`
                : ""
            }
          </div>
        </div>
        <div class="tangram-board-wrap">
          <svg id="tangram-svg" class="tangram-svg" viewBox="0 0 680 420" preserveAspectRatio="xMidYMid meet"></svg>
        </div>
      `;

      this.svg = document.getElementById("tangram-svg");
      if (allowRot) {
        document.getElementById("btn-tangram-rotate").addEventListener("click", () => {
          this.rotateSelectedPiece();
        });
      }

      this.drawBoard();
      this.bindSvgDrag();
    }

    shapePath(shape, size) {
      const h = size / 2;
      if (shape === "square") {
        return `M ${-h} ${-h} L ${h} ${-h} L ${h} ${h} L ${-h} ${h} Z`;
      }
      if (shape === "triangle") {
        return `M 0 ${-h} L ${h} ${h} L ${-h} ${h} Z`;
      }
      if (shape === "right_triangle") {
        return `M ${-h} ${-h} L ${h} ${h} L ${-h} ${h} Z`;
      }
      return "";
    }

    createShapeElement(piece, isTarget) {
      const ns = "http://www.w3.org/2000/svg";
      const g = document.createElementNS(ns, "g");
      const x = isTarget ? piece.targetX : piece.curX;
      const y = isTarget ? piece.targetY : piece.curY;
      const rot = isTarget ? piece.targetRot : piece.curRot;

      g.setAttribute("transform", `translate(${x}, ${y}) rotate(${rot})`);

      let el;
      if (piece.shape === "circle") {
        el = document.createElementNS(ns, "circle");
        el.setAttribute("cx", "0");
        el.setAttribute("cy", "0");
        el.setAttribute("r", String(piece.size / 2));
      } else {
        el = document.createElementNS(ns, "path");
        el.setAttribute("d", this.shapePath(piece.shape, piece.size));
      }

      if (isTarget) {
        el.setAttribute("fill", "#CFE8F7");
        el.setAttribute("stroke", "#4B86A8");
        el.setAttribute("stroke-width", "3");
        el.setAttribute("stroke-dasharray", "8 6");
        if (this.hintSlotId === piece.id) {
          g.classList.add("hint-halo");
          el.setAttribute("stroke", "#FFB703");
          el.setAttribute("stroke-width", "5");
        }
      } else {
        el.setAttribute("fill", piece.color);
        el.setAttribute("stroke", "#1D3557");
        el.setAttribute("stroke-width", "3.5");
        el.setAttribute("stroke-linejoin", "round");
        g.dataset.pieceId = piece.id;
        g.classList.add("tangram-piece");
        if (piece.locked) g.classList.add("locked");
        if (this.selectedId === piece.id && !piece.locked) g.classList.add("selected");
      }

      g.appendChild(el);
      return g;
    }

    drawBoard() {
      const ns = "http://www.w3.org/2000/svg";
      this.svg.innerHTML = "";

      const tray = document.createElementNS(ns, "rect");
      tray.setAttribute("x", "425");
      tray.setAttribute("y", "16");
      tray.setAttribute("width", "240");
      tray.setAttribute("height", "388");
      tray.setAttribute("rx", "26");
      tray.setAttribute("fill", "#FFFFFF");
      tray.setAttribute("opacity", "0.78");
      tray.setAttribute("stroke", "#BCE0F5");
      tray.setAttribute("stroke-width", "3");
      this.svg.appendChild(tray);

      this.pieces.forEach((p) => {
        if (!p.locked) {
          this.svg.appendChild(this.createShapeElement(p, true));
        }
      });

      const ordered = [...this.pieces].sort((a, b) => Number(b.locked) - Number(a.locked));
      ordered.forEach((p) => {
        this.svg.appendChild(this.createShapeElement(p, false));
      });

      const doneCount = this.pieces.filter((p) => p.locked).length;
      const progEl = document.getElementById("tangram-progress");
      if (progEl) progEl.textContent = `SLOŽENO: ${doneCount} / ${this.pieces.length}`;
    }

    svgPoint(clientX, clientY) {
      const pt = this.svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = this.svg.getScreenCTM();
      return ctm ? pt.matrixTransform(ctm.inverse()) : { x: 0, y: 0 };
    }

    bindSvgDrag() {
      this.svg.addEventListener("pointerdown", (e) => {
        const group = e.target.closest(".tangram-piece");
        if (!group) return;
        const piece = this.pieces.find((p) => p.id === group.dataset.pieceId);
        if (!piece || piece.locked) return;

        e.preventDefault();
        try {
          this.svg.setPointerCapture(e.pointerId);
        } catch (_err) {}
        this.selectedId = piece.id;
        const p = this.svgPoint(e.clientX, e.clientY);
        this.dragState = {
          piece,
          offsetX: p.x - piece.curX,
          offsetY: p.y - piece.curY
        };
        this.mascot.audio.playSfx("pop");
        if (piece.label) {
          this.mascot.audio.speakCustom(piece.label);
        }
        this.drawBoard();
        this.mascot.resetInactivityTimer(() => this.triggerHint());
      });

      this.svg.addEventListener("pointermove", (e) => {
        if (!this.dragState) return;
        const p = this.svgPoint(e.clientX, e.clientY);
        this.dragState.piece.curX = Math.max(40, Math.min(640, p.x - this.dragState.offsetX));
        this.dragState.piece.curY = Math.max(40, Math.min(385, p.y - this.dragState.offsetY));
        const activeGroup = this.svg.querySelector(`[data-piece-id="${this.dragState.piece.id}"]`);
        if (activeGroup) {
          activeGroup.setAttribute(
            "transform",
            `translate(${this.dragState.piece.curX}, ${this.dragState.piece.curY}) rotate(${this.dragState.piece.curRot})`
          );
          activeGroup.classList.add("dragging");
        }
      });

      const release = () => {
        if (!this.dragState) return;
        const piece = this.dragState.piece;
        this.dragState = null;
        this.evaluateDrop(piece);
      };

      this.svg.addEventListener("pointerup", release);
      this.svg.addEventListener("pointercancel", release);
    }

    rotationMatches(piece) {
      if (piece.shape === "circle" || piece.shape === "square") return true;
      return ((piece.curRot % 360) + 360) % 360 === ((piece.targetRot % 360) + 360) % 360;
    }

    evaluateDrop(piece) {
      const tol = this.currentCfg.snapTolerance || 34;
      const dist = Math.hypot(piece.curX - piece.targetX, piece.curY - piece.targetY);

      if (dist <= tol && this.rotationMatches(piece)) {
        piece.curX = piece.targetX;
        piece.curY = piece.targetY;
        piece.curRot = piece.targetRot;
        piece.locked = true;
        this.hintSlotId = null;
        this.mistakes = 0;
        this.mascot.audio.playSfx("snap");
        this.mascot.emitParticles(["✨", "⭐"]);
        this.drawBoard();

        if (this.pieces.every((p) => p.locked)) {
          this.mascot.clearInactivityTimer();
          this.mascot.celebrate(this.level.successAudioId || "celebrate_01");
          this.onComplete();
          showContinueBanner(this.hostEl, {
            icon: "🔷",
            title: `STAVBA „${this.currentCfg.title}“ JE HOTOVÁ!`,
            subtitle: "Všechny tvary jsou na svém místě. Pojďme postavit další obrázek!",
            spokenText: `Skvělá stavba! ${this.currentCfg.title} je hotový! Pojďme na další stavbu!`,
            nextLabel: "▶️ DALŠÍ STAVBA ➔",
            onNext: () => this.nextBlueprint()
          });
        }
        return;
      }

      if (piece.curX < 410) {
        this.mistakes += 1;
        const closePosButWrongRot = dist <= tol + 18 && !this.rotationMatches(piece);
        this.animateRubberBack(piece);

        if (this.mistakes >= 2) {
          this.hintSlotId = piece.id;
        }
        this.mascot.gentleNudge(
          closePosButWrongRot ? "hint_shape_rotate" : "hint_shape_corners",
          null,
          this.mistakes >= 2
        );
      }
      this.drawBoard();
    }

    animateRubberBack(piece) {
      const fromX = piece.curX;
      const fromY = piece.curY;
      const start = performance.now();
      const duration = 360;

      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const ease = 1 - Math.pow(1 - t, 3);
        piece.curX = fromX + (piece.startX - fromX) * ease;
        piece.curY = fromY + (piece.startY - fromY) * ease;
        this.drawBoard();
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    rotateSelectedPiece() {
      const piece = this.pieces.find((p) => p.id === this.selectedId && !p.locked);
      if (!piece) return;
      piece.curRot = (piece.curRot + 90) % 360;
      this.mascot.audio.playSfx("pop");
      this.drawBoard();
      this.mascot.resetInactivityTimer(() => this.triggerHint());
    }

    triggerHint() {
      const next = this.pieces.find((p) => !p.locked);
      if (!next) return;
      this.hintSlotId = next.id;
      this.drawBoard();
      this.mascot.gentleNudge("hint_shape_size", null, true);
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  /* =========================================================================
   * 7. HERNÍ ENGINE: ZÓNA C — PRVNÍ PÍSMENO (32 SLOV S INTERAKTIVNÍM ČTENÍM)
   * ========================================================================= */
  const EXTRA_FIRST_LETTER_POOL = [
    { word: "PES", emoji: "🐶", answer: "P", choices: ["P", "B", "M", "K", "T", "S"] },
    { word: "DŮM", emoji: "🏠", answer: "D", choices: ["T", "D", "L", "N", "B", "M"] },
    { word: "SOVA", emoji: "🦉", answer: "S", choices: ["S", "Z", "C", "V", "P", "L"] },
    { word: "VLK", emoji: "🐺", answer: "V", choices: ["V", "F", "B", "M", "K", "D"] },
    { word: "MEDVĚD", emoji: "🐻", answer: "M", choices: ["N", "M", "H", "P", "L", "V"] },
    { word: "KORUNA", emoji: "👑", answer: "K", choices: ["G", "K", "T", "R", "P", "S"] },
    { word: "JABLKO", emoji: "🍎", answer: "J", choices: ["J", "I", "L", "A", "M", "K"] },
    { word: "HRUŠKA", emoji: "🍐", answer: "H", choices: ["H", "K", "M", "R", "B", "N"] },
    { word: "BANÁN", emoji: "🍌", answer: "B", choices: ["P", "B", "D", "V", "M", "L"] },
    { word: "JEŽEK", emoji: "🦔", answer: "J", choices: ["J", "Z", "K", "L", "S", "T"] },
    { word: "ZEBRA", emoji: "🦓", answer: "Z", choices: ["S", "Z", "C", "V", "M", "R"] },
    { word: "HVĚZDA", emoji: "⭐", answer: "H", choices: ["H", "V", "N", "T", "K", "L"] },
    { word: "AUTO", emoji: "🚗", answer: "A", choices: ["A", "E", "O", "U", "M", "T"] },
    { word: "KOČKA", emoji: "🐱", answer: "K", choices: ["K", "T", "P", "L", "M", "S"] },
    { word: "RYBA", emoji: "🐟", answer: "R", choices: ["R", "L", "N", "B", "V", "D"] },
    { word: "SLUNCE", emoji: "☀️", answer: "S", choices: ["S", "Z", "C", "L", "M", "P"] },
    { word: "MOTÝL", emoji: "🦋", answer: "M", choices: ["M", "N", "V", "B", "K", "T"] },
    { word: "STROM", emoji: "🌲", answer: "S", choices: ["S", "T", "R", "M", "L", "P"] },
    { word: "ŽÁBA", emoji: "🐸", answer: "Ž", choices: ["Ž", "Š", "Č", "Z", "S", "B"] },
    { word: "LIŠKA", emoji: "🦊", answer: "L", choices: ["L", "R", "J", "M", "N", "K"] },
    { word: "TUČŇÁK", emoji: "🐧", answer: "T", choices: ["T", "D", "P", "K", "C", "M"] },
    { word: "VELRYBA", emoji: "🐳", answer: "V", choices: ["V", "B", "F", "M", "L", "R"] },
    { word: "RAKETA", emoji: "🚀", answer: "R", choices: ["R", "L", "K", "T", "P", "S"] },
    { word: "KVĚTINA", emoji: "🌸", answer: "K", choices: ["K", "G", "H", "V", "T", "M"] },
    { word: "MÍČ", emoji: "⚽", answer: "M", choices: ["M", "N", "B", "P", "Č", "L"] },
    { word: "LOĎ", emoji: "⛵", answer: "L", choices: ["L", "R", "D", "T", "N", "V"] },
    { word: "VLAK", emoji: "🚂", answer: "V", choices: ["V", "L", "K", "F", "B", "P"] },
    { word: "BUBEN", emoji: "🥁", answer: "B", choices: ["B", "P", "D", "V", "M", "N"] },
    { word: "KYTARA", emoji: "🎸", answer: "K", choices: ["K", "T", "R", "G", "P", "L"] },
    { word: "DEŠTNÍK", emoji: "☂️", answer: "D", choices: ["D", "T", "B", "N", "S", "K"] },
    { word: "SNĚHULÁK", emoji: "⛄", answer: "S", choices: ["S", "Z", "Š", "N", "L", "M"] },
    { word: "MRKEV", emoji: "🥕", answer: "M", choices: ["M", "N", "R", "K", "V", "P"] }
  ];

  class FirstLetterActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.allPool = shuffleArray([...(level.config.rounds || []), ...EXTRA_FIRST_LETTER_POOL]);
      this.poolCursor = 0;
      this.startNewSet(this.pickNextRounds());
    }

    pickNextRounds() {
      const stars = this.level.stars || 1;
      const roundsCount = stars <= 2 ? 3 : stars <= 4 ? 4 : 5;
      const choicesCount = stars === 1 ? 3 : stars <= 3 ? 4 : stars === 4 ? 5 : 6;
      const picked = [];
      for (let i = 0; i < roundsCount; i++) {
        if (this.poolCursor >= this.allPool.length) {
          this.allPool = shuffleArray(this.allPool);
          this.poolCursor = 0;
        }
        const raw = this.allPool[this.poolCursor++];
        const otherLetters = (raw.choices || ["A", "B", "K", "M", "P", "S", "T", "L"]).filter(
          (c) => c !== raw.answer
        );
        const finalChoices = shuffleArray([
          raw.answer,
          ...shuffleArray(otherLetters).slice(0, choicesCount - 1)
        ]);
        picked.push({ ...raw, choices: finalChoices });
      }
      return picked;
    }

    startNewSet(rounds) {
      this.rounds = rounds;
      this.roundIdx = 0;
      this.mistakes = 0;
      this.renderRound();
    }

    speakCurrentWord(round) {
      this.mascot.audio.speakCustom(
        `${round.word}! Na jaké písmeno začíná slovo ${round.word}?`,
        `${round.emoji} ${round.word} — NA JAKÉ PÍSMENO ZAČÍNÁ?`
      );
    }

    renderRound() {
      const round = this.rounds[this.roundIdx];
      if (!round) return;

      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🔤 NA JAKÉ PÍSMENO TO ZAČÍNÁ?</h2>
          <div class="workspace-actions">
            <span class="step-pill current">SLOVO ${this.roundIdx + 1} / ${this.rounds.length}</span>
          </div>
        </div>
        <div class="letter-stage">
          <div class="word-picture-card" id="card-say-word" style="cursor:pointer;">
            <span class="word-emoji">${round.emoji}</span>
            <span class="word-display">${round.word}</span>
            <button id="btn-say-word" class="btn-touch btn-primary">🔊 PŘEČÍST SLOVO</button>
          </div>
          <div id="letter-choices" class="letter-choices">
            ${round.choices
              .map(
                (ch) =>
                  `<button class="btn-touch btn-letter-choice" data-letter="${ch}">${ch}</button>`
              )
              .join("")}
          </div>
        </div>
      `;

      document.getElementById("card-say-word").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.speakCurrentWord(round);
      });

      this.hostEl.querySelectorAll(".btn-letter-choice").forEach((btn) => {
        btn.addEventListener("click", () => this.handleChoice(btn, round));
      });

      this.speakCurrentWord(round);
      this.mascot.resetInactivityTimer(() => this.triggerHint(round));
    }

    handleChoice(btn, round) {
      const picked = btn.dataset.letter;
      if (picked === round.answer) {
        btn.classList.add("correct");
        this.mascot.audio.playSfx("snap");
        this.mascot.emitParticles(["⭐", "✨", "🔤"]);
        this.mascot.audio.speakCustom(`Správně! ${round.word} začíná na písmeno ${picked}!`);
        this.mistakes = 0;

        setTimeout(() => {
          if (this.roundIdx + 1 < this.rounds.length) {
            this.roundIdx += 1;
            this.renderRound();
          } else {
            this.mascot.clearInactivityTimer();
            this.mascot.celebrate(this.level.successAudioId || "celebrate_05");
            this.onComplete();
            showContinueBanner(this.hostEl, {
              icon: "🔤",
              title: "VŠECHNA PÍSMENKA SPRÁVNĚ UHODNUTA!",
              subtitle: "Poslechneme si a uhodneme další nová slovíčka!",
              spokenText: "Výborně! Všechna písmenka jsou uhodnuta! Pojďme na další slovíčka!",
              nextLabel: "▶️ DALŠÍ SLOVÍČKA ➔",
              onNext: () => this.startNewSet(this.pickNextRounds())
            });
          }
        }, 900);
      } else {
        this.mistakes += 1;
        btn.classList.remove("gentle-nudge-anim");
        void btn.offsetWidth;
        btn.classList.add("gentle-nudge-anim");
        this.mascot.audio.speakCustom(
          `Toto je písmeno ${picked}. Poslouchej znovu: ${round.word}!`
        );
        if (this.mistakes >= 2) {
          this.triggerHint(round);
        }
      }
    }

    triggerHint(round) {
      const targetBtn = this.hostEl.querySelector(`[data-letter="${round.answer}"]`);
      if (targetBtn) targetBtn.classList.add("hint-halo");
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  /* =========================================================================
   * 8. HERNÍ ENGINE: ZÓNA D — KRMENÍ TUČŇÁKA (POČÍTÁNÍ RYBIČEK 1★–5★)
   * ========================================================================= */
  class FeedPenguinActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.generateMoreRounds();
    }

    generateMoreRounds() {
      const stars = this.level.stars || 1;
      const ranges = {
        1: [1, 4],
        2: [3, 7],
        3: [5, 10],
        4: [8, 15],
        5: [11, 20]
      };
      const [min, max] = ranges[stars] || [2, 6];
      const pool = [];
      for (let n = min; n <= max; n++) pool.push(n);
      this.rounds = shuffleArray(pool).slice(0, 3);
      this.roundIdx = 0;
      this.bowlCount = 0;
      this.mistakes = 0;
      this.renderRound();
    }

    targetCount() {
      return this.rounds[this.roundIdx] || 3;
    }

    renderRound() {
      const target = this.targetCount();
      const pondTotal = Math.max(target + 4, 12);
      this.bowlCount = 0;
      this.mistakes = 0;

      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🐟 NAKRM PIKA PŘESNĚ ${target} RYBIČKAMI!</h2>
          <div class="workspace-actions">
            <span class="step-pill current">KOLO ${this.roundIdx + 1} / ${this.rounds.length}</span>
          </div>
        </div>
        <div class="feed-layout">
          <section class="pond-panel">
            <div class="panel-heading">
              <span>🌊 ARKTICKÉ JEZÍRKO (ŤUKNI NA RYBIČKU)</span>
              <span>CÍL: ${target} 🐟</span>
            </div>
            <div id="fish-pond-grid" class="fish-pond-grid">
              ${Array.from({ length: pondTotal })
                .map((_, idx) => `<button class="btn-touch btn-fish" data-pond-idx="${idx}" aria-label="Rybička ${idx + 1}">🐟</button>`)
                .join("")}
            </div>
          </section>
          <section class="bowl-panel">
            <div class="panel-heading" style="width:100%;">
              <span>🥣 MISKA PRO PIKA</span>
              <span id="bowl-count-badge">0 / ${target}</span>
            </div>
            <div id="bowl-dropzone" class="bowl-dropzone" aria-label="Miska s rybičkami"></div>
            <div class="bowl-tally">
              <span>RYBIČEK V MISCE:</span>
              <span id="bowl-tally-num" style="color:var(--ocean-blue); font-size:1.5rem;">0</span>
            </div>
            <button id="btn-feed-submit" class="btn-touch btn-feed-submit">🍽️ NAKRMIT TUČŇÁKA</button>
          </section>
        </div>
      `;

      this.bindEvents();
      this.announceTarget(target);
    }

    announceTarget(target) {
      if (target <= 10) {
        const askId = "feed_ask_" + String(target).padStart(2, "0");
        this.mascot.audio.speak(askId);
      } else {
        this.mascot.audio.speakCustom(
          `Mám velký hlad! Dáš mi do misky přesně ${target} rybiček?`,
          `🐟 DEJ DO MISKY PŘESNĚ ${target} RYBIČEK!`
        );
      }
      this.mascot.resetInactivityTimer(() => {
        this.mascot.gentleNudge("hint_count_more", null, true);
      });
    }

    bindEvents() {
      const pondGrid = document.getElementById("fish-pond-grid");
      const bowlEl = document.getElementById("bowl-dropzone");

      pondGrid.addEventListener("click", (e) => {
        const fishBtn = e.target.closest(".btn-fish");
        if (!fishBtn || fishBtn.classList.contains("hidden")) return;
        fishBtn.classList.add("hidden");

        this.bowlCount += 1;
        const bowlFish = document.createElement("button");
        bowlFish.className = "btn-touch btn-fish";
        bowlFish.textContent = "🐟";
        bowlFish.dataset.fromPond = fishBtn.dataset.pondIdx;
        bowlEl.appendChild(bowlFish);

        this.updateBowlUI();
        this.speakNumber(this.bowlCount);
        this.mascot.resetInactivityTimer(() => {
          this.mascot.gentleNudge("hint_count_more", null, true);
        });
      });

      bowlEl.addEventListener("click", (e) => {
        const bowlFish = e.target.closest(".btn-fish");
        if (!bowlFish) return;
        const origin = pondGrid.querySelector(`[data-pond-idx="${bowlFish.dataset.fromPond}"]`);
        if (origin) origin.classList.remove("hidden");
        bowlFish.remove();
        this.bowlCount = Math.max(0, this.bowlCount - 1);
        this.mascot.audio.playSfx("pop");
        this.updateBowlUI();
        if (this.bowlCount > 0) this.speakNumber(this.bowlCount);
      });

      document.getElementById("btn-feed-submit").addEventListener("click", () => {
        this.checkAnswer();
      });
    }

    speakNumber(n) {
      this.mascot.audio.playSfx("count");
      if (n >= 1 && n <= 20) {
        const id = "num_" + String(n).padStart(2, "0");
        this.mascot.audio.speak(id);
      } else {
        this.mascot.audio.speakCustom(String(n));
      }
    }

    updateBowlUI() {
      const target = this.targetCount();
      document.getElementById("bowl-count-badge").textContent = `${this.bowlCount} / ${target}`;
      document.getElementById("bowl-tally-num").textContent = String(this.bowlCount);
    }

    checkAnswer() {
      const target = this.targetCount();
      if (this.bowlCount === target) {
        this.mascot.audio.playSfx("snap");
        if (this.roundIdx + 1 < this.rounds.length) {
          this.mascot.emitParticles(["🐟", "⭐", "💙"]);
          this.mascot.audio.speak("feed_next_round");
          setTimeout(() => {
            this.roundIdx += 1;
            this.renderRound();
          }, 1300);
        } else {
          this.mascot.clearInactivityTimer();
          this.mascot.celebrate(this.level.successAudioId || "celebrate_03");
          this.onComplete();
          showContinueBanner(this.hostEl, {
            icon: "🐟",
            title: "PIKO MÁ PLNÉ BŘÍŠKO! VŠECHNO SPOČÍTÁNO!",
            subtitle: "Chceš spočítat další porci rybiček pro tučňáka?",
            spokenText: "Mňam! Piko má plné bříško! Pojďme počítat další rybičky!",
            nextLabel: "▶️ DALŠÍ KRMENÍ ➔",
            onNext: () => this.generateMoreRounds()
          });
        }
        return;
      }

      this.mistakes += 1;
      const bowl = document.getElementById("bowl-dropzone");
      bowl.classList.remove("gentle-nudge-anim");
      void bowl.offsetWidth;
      bowl.classList.add("gentle-nudge-anim");

      if (this.bowlCount < target) {
        this.mascot.gentleNudge("hint_count_more", null, this.mistakes >= 2);
      } else {
        this.mascot.gentleNudge("hint_count_too_many", null, this.mistakes >= 2);
      }
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  /* =========================================================================
   * 8B. KOMPLETNÍ SADA OSTATNÍCH AKTIVIT (ZÓNY A–E) S NEKONEČNÝM POKRAČOVÁNÍM
   * ========================================================================= */

  // --- AKTIVITA 2: KOUZELNÉ OMALOVÁNKY S MÍCHÁNÍM BAREV (24 OBRÁZKŮ) ---
  function buildColoringPictures() {
    const base = [
      {
        title: "DUHOVÁ RYBIČKA",
        parts: [
          { id: "body", label: "Tělíčko rybičky", d: "M 180 220 C 260 110, 440 110, 500 220 C 440 330, 260 330, 180 220 Z" },
          { id: "tail", label: "Ocásek", d: "M 495 220 L 600 135 L 580 220 L 600 305 Z" },
          { id: "finTop", label: "Horní ploutev", d: "M 290 142 Q 350 65 415 145 Z" },
          { id: "finBot", label: "Spodní ploutev", d: "M 300 298 Q 350 365 405 295 Z" },
          { id: "head", label: "Hlavička", d: "M 180 220 C 215 160, 255 160, 265 220 C 255 280, 215 280, 180 220 Z" }
        ]
      },
      {
        title: "POHÁDKOVÝ HRAD",
        parts: [
          { id: "wall", label: "Hradba", d: "M 210 210 L 510 210 L 510 380 L 210 380 Z" },
          { id: "towerL", label: "Levá věž", d: "M 150 150 L 220 150 L 220 380 L 150 380 Z" },
          { id: "towerR", label: "Pravá věž", d: "M 500 150 L 570 150 L 570 380 L 500 380 Z" },
          { id: "roofL", label: "Levá střecha", d: "M 135 150 L 185 65 L 235 150 Z" },
          { id: "roofR", label: "Pravá střecha", d: "M 485 150 L 535 65 L 585 150 Z" },
          { id: "gate", label: "Brána", d: "M 320 380 L 320 280 Q 360 240 400 280 L 400 380 Z" }
        ]
      },
      {
        title: "ZMRZLINOVÝ POHÁR",
        parts: [
          { id: "cone", label: "Kornoutek", d: "M 270 230 L 450 230 L 360 405 Z" },
          { id: "scoop1", label: "Levý kopeček", d: "M 260 230 A 60 55 0 1 1 370 230 Z" },
          { id: "scoop2", label: "Pravý kopeček", d: "M 350 230 A 60 55 0 1 1 460 230 Z" },
          { id: "scoop3", label: "Horní kopeček", d: "M 300 165 A 62 58 0 1 1 420 165 Z" },
          { id: "cherry", label: "Třešnička", d: "M 340 85 A 22 22 0 1 1 380 85 A 22 22 0 1 1 340 85 Z" }
        ]
      },
      {
        title: "PLACHETNICE NA MOŘI",
        parts: [
          { id: "hull", label: "Trup lodi", d: "M 180 290 L 540 290 L 480 375 L 240 375 Z" },
          { id: "sailL", label: "Hlavní plachta", d: "M 350 80 L 350 275 L 205 275 Z" },
          { id: "sailR", label: "Přední plachta", d: "M 368 105 L 505 275 L 368 275 Z" },
          { id: "flag", label: "Vlaječka", d: "M 350 50 L 415 68 L 350 85 Z" }
        ]
      }
    ];

    const extraTitles = [
      "VESMÍRNÁ RAKETA", "BAREVNÝ MOTÝLEK", "VESELÝ SNĚHULÁK", "KRÁLOVSKÁ KORUNA",
      "ROZKVETLÁ KYTIČKA", "ZELENÝ STROMEČEK", "ROZTOMILÁ SOVIČKA", "RYCHLÉ AUTÍČKO",
      "PARNÍ LOKOMOTIVA", "KOUZELNÝ DOMEČEK", "VELKÁ VELRYBA", "ČERVENÁ BERUŠKA",
      "LESNÍ HŘÍBEK", "POUŤOVÝ BALÓNEK", "ZLATÉ SLUNÍČKO", "SLADKÝ DORTÍK",
      "PAPÍROVÝ DRAK", "HUDEBNÍ KYTARA", "POLÁRNÍ TUČŇÁK", "MOŘSKÁ ŽELVIČKA"
    ];

    extraTitles.forEach((title, idx) => {
      const mode = idx % 4;
      const baseParts = base[mode].parts.map((p) => ({ ...p }));
      base.push({ title, parts: baseParts });
    });

    return base;
  }

  const COLORING_PICTURES = buildColoringPictures();

  class ColorMixActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.store = store;
      this.onComplete = onComplete;
      this.deck = shuffleArray(COLORING_PICTURES);
      this.picIdx = 0;
      this.activeColor = "#2A9D8F";
      this.isZoomed = false;
      this.mixSlots = [null, null];
      this.loadPicture(0);
    }

    loadPicture(idx) {
      this.picIdx = idx % this.deck.length;
      if (this.picIdx === 0 && idx > 0) {
        this.deck = shuffleArray(this.deck);
      }
      this.coloredParts = {};
      this.render();
      const pic = this.deck[this.picIdx];
      this.mascot.audio.speakCustom(
        `Omalovánka ${pic.title}! Namíchej barvičky nebo vyber odstín na kruhu a vybarvi obrázek!`,
        `🖌️ VYBARVI: ${pic.title}`
      );
    }

    nextPicture() {
      this.mascot.audio.playSfx("pop");
      this.loadPicture(this.picIdx + 1);
    }

    render() {
      const pic = this.deck[this.picIdx];
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🖌️ MÍCHÁNÍ BAREV: ${pic.title}</h2>
          <div class="workspace-actions">
            <button id="btn-cmix-zoom" class="btn-touch btn-secondary">🔍 ${this.isZoomed ? "ZMENŠIT" : "ZVĚTŠIT"}</button>
            <span class="step-pill current" id="color-mix-prog">VYBARVENO: 0 / ${pic.parts.length}</span>
          </div>
        </div>
        <div id="cmix-studio-layout" class="studio-layout ${this.isZoomed ? "studio-zoomed" : ""}">
          <div class="canvas-frame">
            <svg id="cmix-svg" viewBox="0 0 720 440" style="width:100%; height:100%; max-height:100%;">
              ${pic.parts
                .map(
                  (p) =>
                    `<path data-part="${p.id}" data-label="${p.label}" d="${p.d}" fill="#FFFFFF" stroke="#1D3557" stroke-width="6" stroke-linejoin="round" style="cursor:pointer; transition:fill 0.2s ease;" />`
                )
                .join("")}
            </svg>
          </div>
          <aside class="studio-sidebar">
            <div class="tool-box">
              <div class="tool-box-title">🧪 NAMÍCHEJ NOVOU BARVU</div>
              <div class="mix-slots">
                <div id="cm-slot-1" class="mix-drop">1</div>
                <span class="mix-plus">+</span>
                <div id="cm-slot-2" class="mix-drop">2</div>
                <span class="mix-plus">=</span>
                <button id="cm-result" class="btn-touch btn-swatch active" style="background:${this.activeColor};" aria-label="Namíchaná barva">🎨</button>
              </div>
              <div style="display:flex; gap:5px; flex-wrap:wrap;">
                ${MIX_BASE_COLORS.map(
                  (mc) =>
                    `<button class="btn-touch btn-secondary cm-pick" data-mix="${mc.id}" data-name="${mc.name}" data-hex="${mc.hex}" style="background:${mc.hex}; color:${mc.textColor}; padding:5px 8px; font-size:0.75rem;">${mc.label}</button>`
                ).join("")}
              </div>
            </div>
            <div class="tool-box">
              <div class="tool-box-title">🌈 RGB KRUH A PALETA BAREV</div>
              <div class="rgb-wheel-row">
                <canvas id="cmix-rgb-wheel" class="rgb-wheel-canvas" width="92" height="92"></canvas>
                <div class="rgb-wheel-info">
                  <div id="cmix-rgb-preview" class="rgb-preview-dot" style="background:${this.activeColor};"></div>
                  <span>Vyber si libovolnou barvu na kruhu!</span>
                </div>
              </div>
              <div class="swatch-grid">
                ${EXTENDED_SWATCH_PALETTE.map(
                  (c) =>
                    `<button class="btn-touch btn-swatch ${c.hex === this.activeColor ? "active" : ""}" data-hex="${c.hex}" data-name="${c.name}" style="background:${c.hex}"></button>`
                ).join("")}
              </div>
            </div>
          </aside>
        </div>
      `;

      const rgbPreview = document.getElementById("cmix-rgb-preview");
      mountRgbColorWheel(document.getElementById("cmix-rgb-wheel"), rgbPreview, (hex) => {
        this.activeColor = hex;
        this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => b.classList.remove("active"));
      });

      document.getElementById("btn-cmix-zoom").addEventListener("click", (e) => {
        this.isZoomed = !this.isZoomed;
        const layout = document.getElementById("cmix-studio-layout");
        if (layout) layout.classList.toggle("studio-zoomed", this.isZoomed);
        e.currentTarget.textContent = `🔍 ${this.isZoomed ? "ZMENŠIT" : "ZVĚTŠIT"}`;
        this.mascot.audio.playSfx("pop");
      });

      this.hostEl.querySelectorAll(".btn-swatch[data-hex]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.activeColor = btn.dataset.hex;
          if (rgbPreview) rgbPreview.style.background = this.activeColor;
          this.mascot.audio.playSfx("pop");
          if (btn.dataset.name) this.mascot.audio.speakCustom(btn.dataset.name);
        });
      });

      this.hostEl.querySelectorAll(".cm-pick").forEach((btn) => {
        btn.addEventListener("click", () => {
          const colorObj = {
            id: btn.dataset.mix,
            name: btn.dataset.name,
            hex: btn.dataset.hex
          };
          this.mascot.audio.playSfx("pop");
          const s1 = document.getElementById("cm-slot-1");
          const s2 = document.getElementById("cm-slot-2");
          const res = document.getElementById("cm-result");
          if (!this.mixSlots[0] || (this.mixSlots[0] && this.mixSlots[1])) {
            this.mixSlots = [colorObj, null];
            s1.style.background = colorObj.hex;
            s1.textContent = "";
            s2.style.background = "#ffffff";
            s2.textContent = "2";
            return;
          }
          this.mixSlots[1] = colorObj;
          s2.style.background = colorObj.hex;
          s2.textContent = "";
          const mixed = mixTwoColors(this.mixSlots[0], this.mixSlots[1]);
          this.activeColor = mixed.hex;
          res.style.background = mixed.hex;
          if (rgbPreview) rgbPreview.style.background = mixed.hex;
          this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => b.classList.remove("active"));
          res.classList.add("active");
          this.mascot.audio.playSfx("mix");
          if (mixed.audioId) this.mascot.audio.speak(mixed.audioId);
          else this.mascot.audio.speakCustom(`Vznikla ${mixed.name}!`);
        });
      });

      this.hostEl.querySelectorAll("#cmix-svg path[data-part]").forEach((pathEl) => {
        pathEl.addEventListener("click", () => {
          const partId = pathEl.dataset.part;
          const partLabel = pathEl.dataset.label || "";
          pathEl.setAttribute("fill", this.activeColor);
          this.coloredParts[partId] = this.activeColor;
          this.mascot.audio.playSfx("snap");
          if (partLabel) {
            this.mascot.audio.speakCustom(partLabel);
          }
          const doneCount = Object.keys(this.coloredParts).length;
          document.getElementById("color-mix-prog").textContent = `VYBARVENO: ${doneCount} / ${pic.parts.length}`;
          if (doneCount === pic.parts.length) {
            this.mascot.celebrate(this.level.successAudioId || "celebrate_04");
            this.onComplete();
            showContinueBanner(this.hostEl, {
              icon: "🌈",
              title: `OMALOVÁNKA „${pic.title}“ JE KRÁSNĚ VYBARVENÁ!`,
              subtitle: "Pojďme namíchat barvy a vybarvit další obrázek!",
              spokenText: `Krásně vybarveno! ${pic.title} září všemi barvami! Pojďme na další omalovánku!`,
              nextLabel: "▶️ DALŠÍ OMALOVÁNKA ➔",
              onNext: () => this.nextPicture()
            });
          }
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 23: SLOŽ SI BARVU (VYBER KOMBINACI DVOU BAREV, ABYS SLOŽIL CÍLOVOU BARVU) ---
  const BUILD_COLOR_RECIPES = [
    { targetName: "ZELENÁ", spoken: "zelenou barvu", targetHex: "#2A9D8F", emoji: "🐸", pair: ["blue", "yellow"], minStars: 1 },
    { targetName: "ORANŽOVÁ", spoken: "oranžovou barvu", targetHex: "#F77F00", emoji: "🥕", pair: ["red", "yellow"], minStars: 1 },
    { targetName: "FIALOVÁ", spoken: "fialovou barvu", targetHex: "#7209B7", emoji: "🍇", pair: ["blue", "red"], minStars: 1 },
    { targetName: "RŮŽOVÁ", spoken: "růžovou barvu", targetHex: "#FF758F", emoji: "🦩", pair: ["red", "white"], minStars: 2 },
    { targetName: "SVĚTLE MODRÁ", spoken: "světle modrou barvu", targetHex: "#4CC9F0", emoji: "❄️", pair: ["blue", "white"], minStars: 2 },
    { targetName: "SVĚTLE ZELENÁ", spoken: "světle zelenou barvu", targetHex: "#80ED99", emoji: "🌱", pair: ["green", "white"], minStars: 2 },
    { targetName: "KRÉMOVĚ ŽLUTÁ", spoken: "krémově žlutou barvu", targetHex: "#FFF3B0", emoji: "🧈", pair: ["white", "yellow"], minStars: 2 },
    { targetName: "ŠEDÁ", spoken: "šedou barvu", targetHex: "#94A3B8", emoji: "🐘", pair: ["black", "white"], minStars: 3 },
    { targetName: "HNĚDÁ", spoken: "hnědou barvu", targetHex: "#8D5B4C", emoji: "🐻", pair: ["green", "red"], minStars: 3 },
    { targetName: "TYRKYSOVÁ", spoken: "tyrkysovou barvu", targetHex: "#00B4D8", emoji: "🐬", pair: ["blue", "green"], minStars: 3 },
    { targetName: "LIMETKOVÁ", spoken: "limetkovou barvu", targetHex: "#AACC00", emoji: "🍐", pair: ["green", "yellow"], minStars: 3 },
    { targetName: "VÍNOVÁ", spoken: "vínovou barvu", targetHex: "#800F2F", emoji: "🍒", pair: ["black", "red"], minStars: 4 },
    { targetName: "NÁMOŘNICKÁ MODRÁ", spoken: "námořnickou modrou barvu", targetHex: "#1D3557", emoji: "⚓", pair: ["black", "blue"], minStars: 4 },
    { targetName: "OLIVOVÁ", spoken: "olivovou barvu", targetHex: "#606C38", emoji: "🫒", pair: ["black", "yellow"], minStars: 5 },
    { targetName: "LESNÍ ZELENÁ", spoken: "lesní zelenou barvu", targetHex: "#1B4332", emoji: "🌲", pair: ["black", "green"], minStars: 5 },
    { targetName: "ŽABÍ ZELENÁ", spoken: "žabí zelenou barvu", targetHex: "#2A9D8F", emoji: "🐢", pair: ["blue", "yellow"], minStars: 1 },
    { targetName: "MANDARINKOVÁ", spoken: "mandarinkovou oranžovou barvu", targetHex: "#F77F00", emoji: "🍊", pair: ["red", "yellow"], minStars: 1 },
    { targetName: "ŠVESTKOVÁ FIALOVÁ", spoken: "švestkovou fialovou barvu", targetHex: "#7209B7", emoji: "🍆", pair: ["blue", "red"], minStars: 1 },
    { targetName: "CUKROVÁ RŮŽOVÁ", spoken: "cukrovou růžovou barvu", targetHex: "#FF758F", emoji: "🧁", pair: ["red", "white"], minStars: 2 },
    { targetName: "OBLAČNÁ MODRÁ", spoken: "oblačnou světle modrou barvu", targetHex: "#4CC9F0", emoji: "☁️", pair: ["blue", "white"], minStars: 2 },
    { targetName: "MYŠÍ ŠEDÁ", spoken: "myší šedou barvu", targetHex: "#94A3B8", emoji: "🐭", pair: ["black", "white"], minStars: 3 },
    { targetName: "ČOKOLÁDOVÁ HNĚDÁ", spoken: "čokoládovou hnědou barvu", targetHex: "#8D5B4C", emoji: "🍫", pair: ["green", "red"], minStars: 3 },
    { targetName: "MOŘSKÁ TYRKYSOVÁ", spoken: "mořskou tyrkysovou barvu", targetHex: "#00B4D8", emoji: "🌊", pair: ["blue", "green"], minStars: 4 },
    { targetName: "NOČNÍ MODRÁ", spoken: "noční tmavě modrou barvu", targetHex: "#1D3557", emoji: "🌌", pair: ["black", "blue"], minStars: 4 },
    { targetName: "SMRKOVÁ ZELENÁ", spoken: "smrkovou tmavě zelenou barvu", targetHex: "#1B4332", emoji: "🎄", pair: ["black", "green"], minStars: 5 }
  ];

  class BuildColorActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.activity = activity;
      this.level = level;
      this.mascot = mascot;
      this.store = store;
      this.onComplete = onComplete;

      const stars = level.stars || 1;
      const eligible = BUILD_COLOR_RECIPES.filter((r) => r.minStars <= Math.max(2, stars));
      this.deck = shuffleArray(eligible.length >= 6 ? eligible : BUILD_COLOR_RECIPES);
      this.roundIdx = 0;
      this.loadRound();
    }

    loadRound() {
      this.recipe = this.deck[this.roundIdx % this.deck.length];
      this.slots = [null, null];
      this.solved = false;

      const stars = this.level.stars || 1;
      const requiredIds = new Set(this.recipe.pair);
      const otherColors = shuffleArray(MIX_BASE_COLORS.filter((c) => !requiredIds.has(c.id)));
      const optionCount = Math.min(MIX_BASE_COLORS.length, 3 + stars);
      const chosen = [
        ...MIX_BASE_COLORS.filter((c) => requiredIds.has(c.id)),
        ...otherColors.slice(0, Math.max(1, optionCount - 2))
      ];
      this.options = shuffleArray(chosen);

      this.render();
      this.mascot.audio.speakCustom(
        `Slož si barvu! Které dvě barvy musíme smíchat, abychom získali ${this.recipe.spoken}? Přetáhni je do kelímků!`,
        `🎨 SLOŽ BARVU: ${this.recipe.targetName}`
      );
    }

    nextRound() {
      this.mascot.audio.playSfx("pop");
      this.roundIdx += 1;
      if (this.roundIdx % this.deck.length === 0) {
        this.deck = shuffleArray(this.deck);
      }
      this.loadRound();
    }

    render() {
      const r = this.recipe;
      const s0 = this.slots[0];
      const s1 = this.slots[1];
      const previewMix = s0 && s1 ? mixTwoColors(s0, s1) : null;

      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🎨 SLOŽ SI BARVU: ${r.emoji} ${r.targetName}</h2>
          <div class="workspace-actions">
            <button id="btn-bcolor-speak" class="btn-touch btn-secondary">🔊 ZADÁNÍ</button>
            <button id="btn-bcolor-reset" class="btn-touch btn-secondary">🔄 VYLÍT KELÍMKY</button>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:space-around; flex:1; gap:12px; padding:8px;">
          <div style="display:flex; align-items:center; gap:18px; background:#F0F9FF; border:3px solid #BAE6FD; border-radius:24px; padding:12px 24px; box-shadow:var(--shadow-soft);">
            <div style="width:76px; height:76px; border-radius:20px; background:${r.targetHex}; border:4px solid #1D3557; display:flex; align-items:center; justify-content:center; font-size:2.3rem; box-shadow:0 6px 14px rgba(0,0,0,0.15);">
              ${r.emoji}
            </div>
            <div>
              <div style="font-size:0.85rem; font-weight:900; color:var(--navy-soft);">CÍLOVÁ BARVA K NAMÍCHÁNÍ:</div>
              <div style="font-size:1.55rem; font-weight:900; color:var(--navy);">${r.targetName}</div>
            </div>
          </div>

          <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap; justify-content:center;">
            <div class="bcolor-slot" data-slot="0" style="width:118px; height:118px; border-radius:24px; border:4px dashed #1D3557; background:${s0 ? s0.hex : "#FFFFFF"}; color:${s0 ? s0.textColor : "#64748B"}; display:flex; flex-direction:column; align-items:center; justify-content:center; font-weight:900; font-size:1rem; cursor:pointer; box-shadow:var(--shadow-soft);">
              ${s0 ? `<span style="font-size:1.6rem;">🪣</span><span>${s0.label}</span>` : `<span style="font-size:1.8rem;">1️⃣</span><span>1. BARVA</span>`}
            </div>
            <span style="font-size:2.4rem; font-weight:900; color:var(--navy);">+</span>
            <div class="bcolor-slot" data-slot="1" style="width:118px; height:118px; border-radius:24px; border:4px dashed #1D3557; background:${s1 ? s1.hex : "#FFFFFF"}; color:${s1 ? s1.textColor : "#64748B"}; display:flex; flex-direction:column; align-items:center; justify-content:center; font-weight:900; font-size:1rem; cursor:pointer; box-shadow:var(--shadow-soft);">
              ${s1 ? `<span style="font-size:1.6rem;">🪣</span><span>${s1.label}</span>` : `<span style="font-size:1.8rem;">2️⃣</span><span>2. BARVA</span>`}
            </div>
            <span style="font-size:2.4rem; font-weight:900; color:var(--navy);">=</span>
            <div style="width:124px; height:118px; border-radius:24px; border:4px solid #1D3557; background:${previewMix ? previewMix.hex : "#F8FAFC"}; display:flex; flex-direction:column; align-items:center; justify-content:center; font-weight:900; color:#fff; text-shadow:0 1px 4px rgba(0,0,0,0.65); box-shadow:var(--shadow-card);">
              <span style="font-size:1.8rem;">${previewMix ? "✨" : "❓"}</span>
              <span style="font-size:0.86rem;">${previewMix ? previewMix.name.toUpperCase() : "TVŮJ MIX"}</span>
            </div>
          </div>

          <div style="display:flex; gap:14px; flex-wrap:wrap; justify-content:center;">
            ${this.options
              .map(
                (c) => `
              <div class="bcolor-pot" data-id="${c.id}" style="width:112px; height:88px; border-radius:20px; border:4px solid #1D3557; background:${c.hex}; color:${c.textColor}; display:flex; flex-direction:column; align-items:center; justify-content:center; font-weight:900; font-size:0.95rem; cursor:grab; box-shadow:0 6px 0 rgba(29,53,87,0.2);">
                <span style="font-size:1.5rem;">🎨</span>
                <span>${c.label}</span>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `;

      document.getElementById("btn-bcolor-speak").addEventListener("click", () => {
        this.mascot.audio.speakCustom(`Slož ${this.recipe.spoken}! Přetáhni dvě barvy do kelímků.`);
      });

      document.getElementById("btn-bcolor-reset").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.slots = [null, null];
        this.render();
      });

      // Kliknutí na kelímek ho vyprázdní
      this.hostEl.querySelectorAll(".bcolor-slot").forEach((slotEl) => {
        slotEl.addEventListener("click", () => {
          if (this.solved) return;
          const idx = Number(slotEl.dataset.slot);
          if (this.slots[idx]) {
            this.slots[idx] = null;
            this.mascot.audio.playSfx("pop");
            this.render();
          }
        });
      });

      // Drag and drop (i na přeskáčku do 1. nebo 2. kelímku); single tap jen přečte název barvy
      bindPointerDragDrop({
        containerEl: this.hostEl,
        sourceSelector: ".bcolor-pot",
        targetSelector: ".bcolor-slot",
        canDrag: () => !this.solved,
        onTap: (srcEl) => {
          const cObj = MIX_BASE_COLORS.find((x) => x.id === srcEl.dataset.id);
          if (cObj) {
            this.mascot.audio.playSfx("pop");
            this.mascot.audio.speakCustom(cObj.name);
          }
        },
        onDrop: (srcEl, targetEl) => {
          const cObj = MIX_BASE_COLORS.find((x) => x.id === srcEl.dataset.id);
          const slotIdx = Number(targetEl.dataset.slot);
          if (!cObj || isNaN(slotIdx)) return;
          // Zabráníme vložení stejné barvy do obou slotů
          const otherIdx = slotIdx === 0 ? 1 : 0;
          if (this.slots[otherIdx] && this.slots[otherIdx].id === cObj.id) {
            this.mascot.audio.speakCustom("Vyber dvě různé barvičky!");
            return;
          }
          this.slots[slotIdx] = cObj;
          this.mascot.audio.playSfx("snap");
          this.render();
          this.checkCombination();
        }
      });
    }

    checkCombination() {
      if (!this.slots[0] || !this.slots[1] || this.solved) return;
      const chosenPair = [this.slots[0].id, this.slots[1].id].sort().join("+");
      const targetPair = [...this.recipe.pair].sort().join("+");

      if (chosenPair === targetPair) {
        this.solved = true;
        this.mascot.audio.playSfx("mix");
        this.mascot.celebrate("celebrate_04");
        this.onComplete();
        showContinueBanner(this.hostEl, {
          icon: this.recipe.emoji,
          title: `VÝBORNĚ! VZNIKLA ${this.recipe.targetName}!`,
          subtitle: `${this.slots[0].label} + ${this.slots[1].label} = ${this.recipe.targetName}`,
          spokenText: `Paráda! Smícháním vznikla ${this.recipe.spoken}! Pojďme složit další barvu!`,
          nextLabel: "▶️ DALŠÍ BARVA ➔",
          onNext: () => this.nextRound()
        });
      } else {
        const wrongMix = mixTwoColors(this.slots[0], this.slots[1]);
        this.mascot.audio.playSfx("pop");
        this.mascot.audio.speakCustom(
          `Tímto vznikla ${wrongMix.name}, ale my hledáme ${this.recipe.spoken}. Zkus jinou dvojici!`,
          `🤔 TO JE ${wrongMix.name.toUpperCase()} — ZKUS JINOU KOMBINACI!`
        );
        setTimeout(() => {
          if (!this.solved) {
            this.slots = [null, null];
            this.render();
          }
        }, 1600);
      }
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 4: ŠKOLA PSANÍ PÍSMEN A SLOV (74 POLOŽEK DLE OBTÍŽNOSTI + PÍSANKA S LINKAMI) ---
  function interpolateStrokePoints(waypoints, step = 16) {
    const points = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const [x1, y1] = waypoints[i];
      const [x2, y2] = waypoints[i + 1];
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(1, Math.round(dist / step));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        points.push([Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t)]);
      }
    }
    points.push(waypoints[waypoints.length - 1]);
    return points;
  }

  function drawHandwritingPaper(ctx, width = 720, height = 460) {
    ctx.save();
    ctx.fillStyle = "#FDFEFE";
    ctx.fillRect(0, 0, width, height);

    // Šikmé pomocné linky písanky (sklon 75°)
    ctx.strokeStyle = "rgba(186, 230, 253, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    for (let x = -60; x <= width + 80; x += 65) {
      ctx.beginPath();
      ctx.moveTo(x + 72, 90);
      ctx.lineTo(x, 395);
      ctx.stroke();
    }

    // 1. Horní dotažnice (☁️ y=110)
    ctx.setLineDash([]);
    ctx.strokeStyle = "#90E0EF";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(35, 110);
    ctx.lineTo(width - 35, 110);
    ctx.stroke();

    // 2. Střední pomocná linka (🌿 y=195)
    ctx.strokeStyle = "#00B4D8";
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(35, 195);
    ctx.lineTo(width - 35, 195);
    ctx.stroke();

    // 3. Základní linka (🏠 y=285) - pevná podlaha písanky
    ctx.setLineDash([]);
    ctx.strokeStyle = "#1D3557";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(25, 285);
    ctx.lineTo(width - 25, 285);
    ctx.stroke();

    // 4. Dolní dotažnice (⚓ y=375) - nožičky písmen
    ctx.strokeStyle = "#F4A261";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(35, 375);
    ctx.lineTo(width - 35, 375);
    ctx.stroke();

    // Montessori / školní vizuální symboly linek
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("☁️", 30, 110);
    ctx.fillText("🌿", 30, 195);
    ctx.fillText("🏠", 26, 285);
    ctx.fillText("⚓", 30, 375);

    ctx.restore();
  }

  const HANDWRITING_CATALOG = [
  {
    "id": "up_A",
    "stars": 1,
    "char": "A",
    "title": "VELKÉ TISKACÍ A",
    "spoken": "velké tiskací A",
    "prompt": "Napiš velké tiskací A! Začni na špičce nahoře a veď dvě šikmé nožičky dolů, pak udělej příčku uprostřed.",
    "strokes": [
      [
        [
          360,
          110
        ],
        [
          305,
          285
        ]
      ],
      [
        [
          360,
          110
        ],
        [
          415,
          285
        ]
      ],
      [
        [
          328,
          225
        ],
        [
          392,
          225
        ]
      ]
    ]
  },
  {
    "id": "up_B",
    "stars": 1,
    "char": "B",
    "title": "VELKÉ TISKACÍ B",
    "spoken": "velké tiskací B",
    "prompt": "Napiš velké tiskací B! Začni svislou čarou shora dolů, a pak přidej dvě kulatá bříška.",
    "strokes": [
      [
        [
          315,
          110
        ],
        [
          315,
          285
        ]
      ],
      [
        [
          315,
          110
        ],
        [
          375,
          110
        ],
        [
          405,
          145
        ],
        [
          375,
          195
        ],
        [
          315,
          195
        ]
      ],
      [
        [
          315,
          195
        ],
        [
          385,
          195
        ],
        [
          415,
          240
        ],
        [
          385,
          285
        ],
        [
          315,
          285
        ]
      ]
    ]
  },
  {
    "id": "up_C",
    "stars": 1,
    "char": "C",
    "title": "VELKÉ TISKACÍ C",
    "spoken": "velké tiskací C",
    "prompt": "Napiš velké tiskací C! Udělej velký oblouček zprava doleva jako otevřený půlměsíc.",
    "strokes": [
      [
        [
          415,
          145
        ],
        [
          385,
          110
        ],
        [
          335,
          110
        ],
        [
          305,
          160
        ],
        [
          305,
          235
        ],
        [
          335,
          285
        ],
        [
          385,
          285
        ],
        [
          415,
          250
        ]
      ]
    ]
  },
  {
    "id": "up_D",
    "stars": 1,
    "char": "D",
    "title": "VELKÉ TISKACÍ D",
    "spoken": "velké tiskací D",
    "prompt": "Napiš velké tiskací D! Začni rovnou čarou dolů a pak přidej jedno velké břicho.",
    "strokes": [
      [
        [
          315,
          110
        ],
        [
          315,
          285
        ]
      ],
      [
        [
          315,
          110
        ],
        [
          375,
          110
        ],
        [
          415,
          155
        ],
        [
          415,
          240
        ],
        [
          375,
          285
        ],
        [
          315,
          285
        ]
      ]
    ]
  },
  {
    "id": "up_E",
    "stars": 1,
    "char": "E",
    "title": "VELKÉ TISKACÍ E",
    "spoken": "velké tiskací E",
    "prompt": "Napiš velké tiskací E! Rovná čára dolů a tři vodorovné nožičky doprava.",
    "strokes": [
      [
        [
          320,
          110
        ],
        [
          320,
          285
        ]
      ],
      [
        [
          320,
          110
        ],
        [
          410,
          110
        ]
      ],
      [
        [
          320,
          195
        ],
        [
          385,
          195
        ]
      ],
      [
        [
          320,
          285
        ],
        [
          410,
          285
        ]
      ]
    ]
  },
  {
    "id": "up_K",
    "stars": 1,
    "char": "K",
    "title": "VELKÉ TISKACÍ K",
    "spoken": "velké tiskací K",
    "prompt": "Napiš velké tiskací K! Rovná čára dolů, a pak šikmá stříška k ní a od ní nožička.",
    "strokes": [
      [
        [
          320,
          110
        ],
        [
          320,
          285
        ]
      ],
      [
        [
          405,
          110
        ],
        [
          320,
          195
        ]
      ],
      [
        [
          325,
          195
        ],
        [
          410,
          285
        ]
      ]
    ]
  },
  {
    "id": "up_L",
    "stars": 1,
    "char": "L",
    "title": "VELKÉ TISKACÍ L",
    "spoken": "velké tiskací L",
    "prompt": "Napiš velké tiskací L! Rovně dolů a po zemi doprava.",
    "strokes": [
      [
        [
          320,
          110
        ],
        [
          320,
          285
        ]
      ],
      [
        [
          320,
          285
        ],
        [
          410,
          285
        ]
      ]
    ]
  },
  {
    "id": "up_M",
    "stars": 1,
    "char": "M",
    "title": "VELKÉ TISKACÍ M",
    "spoken": "velké tiskací M",
    "prompt": "Napiš velké tiskací M! Nahoru, dolů do údolí, nahoru na kopec a dolů k zemi.",
    "strokes": [
      [
        [
          305,
          285
        ],
        [
          305,
          110
        ]
      ],
      [
        [
          305,
          110
        ],
        [
          360,
          215
        ]
      ],
      [
        [
          360,
          215
        ],
        [
          415,
          110
        ]
      ],
      [
        [
          415,
          110
        ],
        [
          415,
          285
        ]
      ]
    ]
  },
  {
    "id": "up_O",
    "stars": 1,
    "char": "O",
    "title": "VELKÉ TISKACÍ O",
    "spoken": "velké tiskací O",
    "prompt": "Napiš velké tiskací O! Jedno krásné kulaté kolečko odshora dokola.",
    "strokes": [
      [
        [
          360,
          110
        ],
        [
          315,
          145
        ],
        [
          305,
          195
        ],
        [
          315,
          250
        ],
        [
          360,
          285
        ],
        [
          405,
          250
        ],
        [
          415,
          195
        ],
        [
          405,
          145
        ],
        [
          360,
          110
        ]
      ]
    ]
  },
  {
    "id": "up_P",
    "stars": 1,
    "char": "P",
    "title": "VELKÉ TISKACÍ P",
    "spoken": "velké tiskací P",
    "prompt": "Napiš velké tiskací P! Rovná čára dolů a nahoře jedno kulaté bříško.",
    "strokes": [
      [
        [
          320,
          110
        ],
        [
          320,
          285
        ]
      ],
      [
        [
          320,
          110
        ],
        [
          380,
          110
        ],
        [
          410,
          145
        ],
        [
          380,
          195
        ],
        [
          320,
          195
        ]
      ]
    ]
  },
  {
    "id": "up_R",
    "stars": 1,
    "char": "R",
    "title": "VELKÉ TISKACÍ R",
    "spoken": "velké tiskací R",
    "prompt": "Napiš velké tiskací R! Rovná čára dolů, horní bříško a šikmá nožička na zem.",
    "strokes": [
      [
        [
          320,
          110
        ],
        [
          320,
          285
        ]
      ],
      [
        [
          320,
          110
        ],
        [
          380,
          110
        ],
        [
          410,
          145
        ],
        [
          380,
          195
        ],
        [
          320,
          195
        ]
      ],
      [
        [
          345,
          195
        ],
        [
          410,
          285
        ]
      ]
    ]
  },
  {
    "id": "up_S",
    "stars": 1,
    "char": "S",
    "title": "VELKÉ TISKACÍ S",
    "spoken": "velké tiskací S",
    "prompt": "Napiš velké tiskací S! Kličkuj jako had, napřed doleva a pak doprava.",
    "strokes": [
      [
        [
          405,
          145
        ],
        [
          375,
          110
        ],
        [
          335,
          115
        ],
        [
          320,
          155
        ],
        [
          360,
          195
        ],
        [
          400,
          235
        ],
        [
          385,
          285
        ],
        [
          335,
          285
        ],
        [
          310,
          250
        ]
      ]
    ]
  },
  {
    "id": "up_T",
    "stars": 1,
    "char": "T",
    "title": "VELKÉ TISKACÍ T",
    "spoken": "velké tiskací T",
    "prompt": "Napiš velké tiskací T! Rovná čára dolů a nahoře rovná stříška.",
    "strokes": [
      [
        [
          360,
          110
        ],
        [
          360,
          285
        ]
      ],
      [
        [
          300,
          110
        ],
        [
          420,
          110
        ]
      ]
    ]
  },
  {
    "id": "up_U",
    "stars": 1,
    "char": "U",
    "title": "VELKÉ TISKACÍ U",
    "spoken": "velké tiskací U",
    "prompt": "Napiš velké tiskací U! Sjeď dolů do údolíčka, zaobli a vyjeď zase nahoru.",
    "strokes": [
      [
        [
          315,
          110
        ],
        [
          315,
          240
        ],
        [
          345,
          285
        ],
        [
          375,
          285
        ],
        [
          405,
          240
        ],
        [
          405,
          110
        ]
      ]
    ]
  },
  {
    "id": "up_V",
    "stars": 1,
    "char": "V",
    "title": "VELKÉ TISKACÍ V",
    "spoken": "velké tiskací V",
    "prompt": "Napiš velké tiskací V! Šikmo dolů do špičky a hned šikmo nahoru.",
    "strokes": [
      [
        [
          315,
          110
        ],
        [
          360,
          285
        ]
      ],
      [
        [
          360,
          285
        ],
        [
          405,
          110
        ]
      ]
    ]
  },
  {
    "id": "up_Z",
    "stars": 1,
    "char": "Z",
    "title": "VELKÉ TISKACÍ Z",
    "spoken": "velké tiskací Z",
    "prompt": "Napiš velké tiskací Z! Vodorovně doprava, šikmo dolů a po zemi doprava jako blesk.",
    "strokes": [
      [
        [
          315,
          110
        ],
        [
          405,
          110
        ]
      ],
      [
        [
          405,
          110
        ],
        [
          315,
          285
        ]
      ],
      [
        [
          315,
          285
        ],
        [
          405,
          285
        ]
      ]
    ]
  },
  {
    "id": "lp_a",
    "stars": 2,
    "char": "a",
    "title": "MALÉ TISKACÍ a",
    "spoken": "malé tiskací a",
    "prompt": "Napiš malé tiskací a! Kulaté bříško mezi linkami a svislá nožička vpravo.",
    "strokes": [
      [
        [
          395,
          215
        ],
        [
          365,
          195
        ],
        [
          330,
          215
        ],
        [
          320,
          245
        ],
        [
          335,
          280
        ],
        [
          375,
          285
        ],
        [
          400,
          255
        ],
        [
          400,
          215
        ]
      ],
      [
        [
          400,
          195
        ],
        [
          400,
          285
        ]
      ]
    ]
  },
  {
    "id": "lp_b",
    "stars": 2,
    "char": "b",
    "title": "MALÉ TISKACÍ b",
    "spoken": "malé tiskací b",
    "prompt": "Napiš malé tiskací b! Dlouhá vysoká čára shora dolů a kulaté bříško vpravo.",
    "strokes": [
      [
        [
          330,
          110
        ],
        [
          330,
          285
        ]
      ],
      [
        [
          330,
          215
        ],
        [
          365,
          195
        ],
        [
          400,
          220
        ],
        [
          400,
          260
        ],
        [
          365,
          285
        ],
        [
          330,
          280
        ]
      ]
    ]
  },
  {
    "id": "lp_c",
    "stars": 2,
    "char": "c",
    "title": "MALÉ TISKACÍ c",
    "spoken": "malé tiskací c",
    "prompt": "Napiš malé tiskací c! Malý oblouček zprava doleva mezi dvěma linkami.",
    "strokes": [
      [
        [
          400,
          215
        ],
        [
          370,
          195
        ],
        [
          335,
          215
        ],
        [
          325,
          245
        ],
        [
          335,
          275
        ],
        [
          370,
          285
        ],
        [
          400,
          265
        ]
      ]
    ]
  },
  {
    "id": "lp_d",
    "stars": 2,
    "char": "d",
    "title": "MALÉ TISKACÍ d",
    "spoken": "malé tiskací d",
    "prompt": "Napiš malé tiskací d! Kulaté bříško vlevo a vysoká čára shora dolů vpravo.",
    "strokes": [
      [
        [
          395,
          220
        ],
        [
          365,
          195
        ],
        [
          330,
          220
        ],
        [
          330,
          260
        ],
        [
          365,
          285
        ],
        [
          395,
          280
        ]
      ],
      [
        [
          395,
          110
        ],
        [
          395,
          285
        ]
      ]
    ]
  },
  {
    "id": "lp_e",
    "stars": 2,
    "char": "e",
    "title": "MALÉ TISKACÍ e",
    "spoken": "malé tiskací e",
    "prompt": "Napiš malé tiskací e! Vodorovná čárka zevnitř a oblouček dokola.",
    "strokes": [
      [
        [
          330,
          245
        ],
        [
          395,
          245
        ],
        [
          395,
          220
        ],
        [
          365,
          195
        ],
        [
          335,
          215
        ],
        [
          325,
          250
        ],
        [
          345,
          285
        ],
        [
          395,
          285
        ]
      ]
    ]
  },
  {
    "id": "lp_k",
    "stars": 2,
    "char": "k",
    "title": "MALÉ TISKACÍ k",
    "spoken": "malé tiskací k",
    "prompt": "Napiš malé tiskací k! Vysoká čára shora dolů a malé šikmé nožičky.",
    "strokes": [
      [
        [
          330,
          110
        ],
        [
          330,
          285
        ]
      ],
      [
        [
          395,
          195
        ],
        [
          335,
          245
        ]
      ],
      [
        [
          345,
          235
        ],
        [
          400,
          285
        ]
      ]
    ]
  },
  {
    "id": "lp_l",
    "stars": 2,
    "char": "l",
    "title": "MALÉ TISKACÍ l",
    "spoken": "malé tiskací l",
    "prompt": "Napiš malé tiskací l! Jedna rovná vysoká čára od horní linky až na zem.",
    "strokes": [
      [
        [
          360,
          110
        ],
        [
          360,
          285
        ]
      ]
    ]
  },
  {
    "id": "lp_m",
    "stars": 2,
    "char": "m",
    "title": "MALÉ TISKACÍ m",
    "spoken": "malé tiskací m",
    "prompt": "Napiš malé tiskací m! Svislá nožička a dva obloučky vedle sebe jako velbloud.",
    "strokes": [
      [
        [
          315,
          195
        ],
        [
          315,
          285
        ]
      ],
      [
        [
          315,
          220
        ],
        [
          340,
          195
        ],
        [
          365,
          220
        ],
        [
          365,
          285
        ]
      ],
      [
        [
          365,
          220
        ],
        [
          390,
          195
        ],
        [
          415,
          220
        ],
        [
          415,
          285
        ]
      ]
    ]
  },
  {
    "id": "lp_o",
    "stars": 2,
    "char": "o",
    "title": "MALÉ TISKACÍ o",
    "spoken": "malé tiskací o",
    "prompt": "Napiš malé tiskací o! Malé kulaté kolečko přesně mezi linkami.",
    "strokes": [
      [
        [
          360,
          195
        ],
        [
          330,
          215
        ],
        [
          325,
          245
        ],
        [
          335,
          275
        ],
        [
          360,
          285
        ],
        [
          385,
          275
        ],
        [
          395,
          245
        ],
        [
          385,
          215
        ],
        [
          360,
          195
        ]
      ]
    ]
  },
  {
    "id": "lp_p",
    "stars": 2,
    "char": "p",
    "title": "MALÉ TISKACÍ p",
    "spoken": "malé tiskací p",
    "prompt": "Napiš malé tiskací p! Nožička dolů pod linku ke kotvě a kulaté bříško nahoře.",
    "strokes": [
      [
        [
          330,
          195
        ],
        [
          330,
          375
        ]
      ],
      [
        [
          330,
          215
        ],
        [
          365,
          195
        ],
        [
          400,
          220
        ],
        [
          400,
          260
        ],
        [
          365,
          285
        ],
        [
          330,
          280
        ]
      ]
    ]
  },
  {
    "id": "lp_r",
    "stars": 2,
    "char": "r",
    "title": "MALÉ TISKACÍ r",
    "spoken": "malé tiskací r",
    "prompt": "Napiš malé tiskací r! Rovná nožička dolů a nahoře malá větvička doprava.",
    "strokes": [
      [
        [
          335,
          195
        ],
        [
          335,
          285
        ]
      ],
      [
        [
          335,
          220
        ],
        [
          365,
          195
        ],
        [
          395,
          205
        ]
      ]
    ]
  },
  {
    "id": "lp_s",
    "stars": 2,
    "char": "s",
    "title": "MALÉ TISKACÍ s",
    "spoken": "malé tiskací s",
    "prompt": "Napiš malé tiskací s! Malý hadík kličkuje mezi linkami.",
    "strokes": [
      [
        [
          390,
          215
        ],
        [
          370,
          195
        ],
        [
          345,
          200
        ],
        [
          335,
          225
        ],
        [
          360,
          245
        ],
        [
          385,
          265
        ],
        [
          370,
          285
        ],
        [
          340,
          285
        ],
        [
          325,
          265
        ]
      ]
    ]
  },
  {
    "id": "lp_t",
    "stars": 2,
    "char": "t",
    "title": "MALÉ TISKACÍ t",
    "spoken": "malé tiskací t",
    "prompt": "Napiš malé tiskací t! Svislá hůlka s malým háčkem a vodorovná příčka.",
    "strokes": [
      [
        [
          360,
          135
        ],
        [
          360,
          270
        ],
        [
          380,
          285
        ]
      ],
      [
        [
          330,
          195
        ],
        [
          390,
          195
        ]
      ]
    ]
  },
  {
    "id": "lp_u",
    "stars": 2,
    "char": "u",
    "title": "MALÉ TISKACÍ u",
    "spoken": "malé tiskací u",
    "prompt": "Napiš malé tiskací u! Malé údolíčko a nožička dolů k zemi.",
    "strokes": [
      [
        [
          330,
          195
        ],
        [
          330,
          260
        ],
        [
          355,
          285
        ],
        [
          385,
          285
        ],
        [
          395,
          260
        ],
        [
          395,
          195
        ]
      ],
      [
        [
          395,
          195
        ],
        [
          395,
          285
        ]
      ]
    ]
  },
  {
    "id": "lp_v",
    "stars": 2,
    "char": "v",
    "title": "MALÉ TISKACÍ v",
    "spoken": "malé tiskací v",
    "prompt": "Napiš malé tiskací v! Malá špička dolů a nahoru mezi linkami.",
    "strokes": [
      [
        [
          330,
          195
        ],
        [
          365,
          285
        ]
      ],
      [
        [
          365,
          285
        ],
        [
          400,
          195
        ]
      ]
    ]
  },
  {
    "id": "lp_z",
    "stars": 2,
    "char": "z",
    "title": "MALÉ TISKACÍ z",
    "spoken": "malé tiskací z",
    "prompt": "Napiš malé tiskací z! Malý blesk mezi dvěma linkami.",
    "strokes": [
      [
        [
          330,
          195
        ],
        [
          390,
          195
        ]
      ],
      [
        [
          390,
          195
        ],
        [
          330,
          285
        ]
      ],
      [
        [
          330,
          285
        ],
        [
          395,
          285
        ]
      ]
    ]
  },
  {
    "id": "uc_A",
    "stars": 3,
    "char": "A",
    "title": "VELKÉ PSACÍ A",
    "spoken": "velké psací A",
    "prompt": "Napiš velké psací A! Začni u základní linky háčkem, vytáhni oblouk nahoru k mráčkům a sjeď dolů k zemi.",
    "strokes": [
      [
        [
          340,
          275
        ],
        [
          325,
          285
        ],
        [
          335,
          265
        ],
        [
          380,
          115
        ],
        [
          415,
          285
        ],
        [
          435,
          275
        ]
      ],
      [
        [
          355,
          225
        ],
        [
          415,
          225
        ],
        [
          430,
          245
        ]
      ]
    ]
  },
  {
    "id": "uc_B",
    "stars": 3,
    "char": "B",
    "title": "VELKÉ PSACÍ B",
    "spoken": "velké psací B",
    "prompt": "Napiš velké psací B! Svislá hůlka dolů s malou kličkou, a dvě vázaná bříška.",
    "strokes": [
      [
        [
          340,
          120
        ],
        [
          330,
          285
        ],
        [
          320,
          280
        ]
      ],
      [
        [
          325,
          140
        ],
        [
          370,
          115
        ],
        [
          405,
          145
        ],
        [
          370,
          195
        ],
        [
          335,
          195
        ]
      ],
      [
        [
          335,
          195
        ],
        [
          390,
          195
        ],
        [
          420,
          235
        ],
        [
          390,
          285
        ],
        [
          325,
          285
        ]
      ]
    ]
  },
  {
    "id": "uc_C",
    "stars": 3,
    "char": "C",
    "title": "VELKÉ PSACÍ C",
    "spoken": "velké psací C",
    "prompt": "Napiš velké psací C! Ladný velký oblouk začínající kličkou nahoře u mráčků.",
    "strokes": [
      [
        [
          405,
          140
        ],
        [
          370,
          115
        ],
        [
          330,
          140
        ],
        [
          320,
          205
        ],
        [
          335,
          265
        ],
        [
          375,
          285
        ],
        [
          420,
          270
        ]
      ]
    ]
  },
  {
    "id": "uc_D",
    "stars": 3,
    "char": "D",
    "title": "VELKÉ PSACÍ D",
    "spoken": "velké psací D",
    "prompt": "Napiš velké psací D! Svislá čára dolů, spodní smyčka po zemi a velké vypouklé břicho.",
    "strokes": [
      [
        [
          340,
          120
        ],
        [
          330,
          285
        ],
        [
          315,
          280
        ],
        [
          315,
          260
        ],
        [
          355,
          285
        ],
        [
          415,
          260
        ],
        [
          420,
          150
        ],
        [
          375,
          115
        ],
        [
          335,
          130
        ]
      ]
    ]
  },
  {
    "id": "uc_E",
    "stars": 3,
    "char": "E",
    "title": "VELKÉ PSACÍ E",
    "spoken": "velké psací E",
    "prompt": "Napiš velké psací E! Horní vázaná mistička s kličkou a dolní bříško na lince.",
    "strokes": [
      [
        [
          390,
          140
        ],
        [
          360,
          115
        ],
        [
          330,
          140
        ],
        [
          345,
          185
        ],
        [
          370,
          190
        ],
        [
          340,
          195
        ],
        [
          325,
          240
        ],
        [
          350,
          285
        ],
        [
          405,
          280
        ]
      ]
    ]
  },
  {
    "id": "uc_L",
    "stars": 3,
    "char": "L",
    "title": "VELKÉ PSACÍ L",
    "spoken": "velké psací L",
    "prompt": "Napiš velké psací L! Krásná horní smyčka dolů k zemi a vlnka na podlaze.",
    "strokes": [
      [
        [
          345,
          155
        ],
        [
          360,
          115
        ],
        [
          345,
          115
        ],
        [
          325,
          260
        ],
        [
          315,
          285
        ],
        [
          340,
          285
        ],
        [
          410,
          275
        ]
      ]
    ]
  },
  {
    "id": "uc_M",
    "stars": 3,
    "char": "M",
    "title": "VELKÉ PSACÍ M",
    "spoken": "velké psací M",
    "prompt": "Napiš velké psací M! Tři spojené vysoké vlnky se šikmým sklonem.",
    "strokes": [
      [
        [
          295,
          270
        ],
        [
          310,
          125
        ],
        [
          335,
          115
        ],
        [
          345,
          280
        ],
        [
          355,
          130
        ],
        [
          380,
          115
        ],
        [
          395,
          280
        ],
        [
          405,
          135
        ],
        [
          430,
          120
        ],
        [
          440,
          275
        ],
        [
          455,
          285
        ]
      ]
    ]
  },
  {
    "id": "uc_O",
    "stars": 3,
    "char": "O",
    "title": "VELKÉ PSACÍ O",
    "spoken": "velké psací O",
    "prompt": "Napiš velké psací O! Velký vázaný ovál s horní kličkou na uvázání.",
    "strokes": [
      [
        [
          380,
          115
        ],
        [
          335,
          145
        ],
        [
          320,
          205
        ],
        [
          335,
          265
        ],
        [
          375,
          285
        ],
        [
          415,
          255
        ],
        [
          420,
          180
        ],
        [
          395,
          115
        ],
        [
          375,
          125
        ],
        [
          415,
          125
        ]
      ]
    ]
  },
  {
    "id": "uc_P",
    "stars": 3,
    "char": "P",
    "title": "VELKÉ PSACÍ P",
    "spoken": "velké psací P",
    "prompt": "Napiš velké psací P! Šikmá hůlka a nahoře ladná čepička s bříškem.",
    "strokes": [
      [
        [
          340,
          120
        ],
        [
          330,
          285
        ],
        [
          315,
          280
        ]
      ],
      [
        [
          320,
          145
        ],
        [
          365,
          115
        ],
        [
          410,
          145
        ],
        [
          375,
          195
        ],
        [
          335,
          195
        ]
      ]
    ]
  },
  {
    "id": "uc_R",
    "stars": 3,
    "char": "R",
    "title": "VELKÉ PSACÍ R",
    "spoken": "velké psací R",
    "prompt": "Napiš velké psací R! Hůlka dolů, horní bříško a šikmá nožička s háčkem.",
    "strokes": [
      [
        [
          340,
          120
        ],
        [
          330,
          285
        ],
        [
          315,
          280
        ]
      ],
      [
        [
          320,
          145
        ],
        [
          365,
          115
        ],
        [
          410,
          145
        ],
        [
          375,
          195
        ],
        [
          335,
          195
        ]
      ],
      [
        [
          355,
          195
        ],
        [
          410,
          285
        ],
        [
          430,
          280
        ]
      ]
    ]
  },
  {
    "id": "uc_S",
    "stars": 3,
    "char": "S",
    "title": "VELKÉ PSACÍ S",
    "spoken": "velké psací S",
    "prompt": "Napiš velké psací S! Náběhová čára ze země nahoru k mráčkům, klička a velké břicho.",
    "strokes": [
      [
        [
          320,
          285
        ],
        [
          380,
          115
        ],
        [
          405,
          135
        ],
        [
          370,
          180
        ],
        [
          415,
          240
        ],
        [
          390,
          285
        ],
        [
          335,
          285
        ]
      ]
    ]
  },
  {
    "id": "uc_T",
    "stars": 3,
    "char": "T",
    "title": "VELKÉ PSACÍ T",
    "spoken": "velké psací T",
    "prompt": "Napiš velké psací T! Ladná zvlněná stříška a svislá hůlka s nožičkou.",
    "strokes": [
      [
        [
          315,
          120
        ],
        [
          365,
          115
        ],
        [
          415,
          120
        ]
      ],
      [
        [
          365,
          115
        ],
        [
          365,
          265
        ],
        [
          385,
          285
        ]
      ]
    ]
  },
  {
    "id": "uc_U",
    "stars": 3,
    "char": "U",
    "title": "VELKÉ PSACÍ U",
    "spoken": "velké psací U",
    "prompt": "Napiš velké psací U! Horní háček, hluboké údolíčko k zemi a druhá nožička s kličkou.",
    "strokes": [
      [
        [
          315,
          135
        ],
        [
          335,
          115
        ],
        [
          335,
          255
        ],
        [
          365,
          285
        ],
        [
          395,
          255
        ],
        [
          395,
          120
        ],
        [
          395,
          275
        ],
        [
          415,
          285
        ]
      ]
    ]
  },
  {
    "id": "uc_V",
    "stars": 3,
    "char": "V",
    "title": "VELKÉ PSACÍ V",
    "spoken": "velké psací V",
    "prompt": "Napiš velké psací V! Náběh shora, hluboký oblouk a horní zakončovací vlnka.",
    "strokes": [
      [
        [
          315,
          135
        ],
        [
          335,
          115
        ],
        [
          360,
          285
        ],
        [
          400,
          125
        ],
        [
          420,
          135
        ]
      ]
    ]
  },
  {
    "id": "uc_Z",
    "stars": 3,
    "char": "Z",
    "title": "VELKÉ PSACÍ Z",
    "spoken": "velké psací Z",
    "prompt": "Napiš velké psací Z! Horní vlnka, šikmá čára na zem a dolní smyčka pod podlahu ke kotvě.",
    "strokes": [
      [
        [
          325,
          125
        ],
        [
          385,
          115
        ],
        [
          335,
          285
        ],
        [
          370,
          285
        ],
        [
          360,
          365
        ],
        [
          330,
          365
        ],
        [
          345,
          305
        ],
        [
          405,
          285
        ]
      ]
    ]
  },
  {
    "id": "lc_a",
    "stars": 4,
    "char": "a",
    "title": "MALÉ PSACÍ a",
    "spoken": "malé psací a",
    "prompt": "Napiš malé psací a! Náběhový háček k trávě, kulaté bříško a zakončovací ocásek.",
    "strokes": [
      [
        [
          315,
          270
        ],
        [
          345,
          195
        ]
      ],
      [
        [
          380,
          195
        ],
        [
          340,
          205
        ],
        [
          330,
          245
        ],
        [
          345,
          280
        ],
        [
          380,
          280
        ],
        [
          385,
          200
        ]
      ],
      [
        [
          385,
          200
        ],
        [
          385,
          275
        ],
        [
          410,
          285
        ]
      ]
    ]
  },
  {
    "id": "lc_b",
    "stars": 4,
    "char": "b",
    "title": "MALÉ PSACÍ b",
    "spoken": "malé psací b",
    "prompt": "Napiš malé psací b! Dlouhá vysoká smyčka nahoru k mráčkům a spodní bříško s kličkou.",
    "strokes": [
      [
        [
          320,
          285
        ],
        [
          365,
          115
        ],
        [
          350,
          115
        ],
        [
          350,
          280
        ],
        [
          390,
          280
        ],
        [
          395,
          235
        ],
        [
          415,
          235
        ]
      ]
    ]
  },
  {
    "id": "lc_c",
    "stars": 4,
    "char": "c",
    "title": "MALÉ PSACÍ c",
    "spoken": "malé psací c",
    "prompt": "Napiš malé psací c! Náběh z podlahy k trávě a ladný otevřený oblouček s ocáskem.",
    "strokes": [
      [
        [
          315,
          280
        ],
        [
          365,
          195
        ],
        [
          340,
          205
        ],
        [
          330,
          245
        ],
        [
          345,
          280
        ],
        [
          400,
          285
        ]
      ]
    ]
  },
  {
    "id": "lc_d",
    "stars": 4,
    "char": "d",
    "title": "MALÉ PSACÍ d",
    "spoken": "malé psací d",
    "prompt": "Napiš malé psací d! Kulaté bříško na podlaze a vysoká smyčka nahoru do nebe s nožičkou.",
    "strokes": [
      [
        [
          355,
          200
        ],
        [
          330,
          215
        ],
        [
          325,
          255
        ],
        [
          345,
          280
        ],
        [
          375,
          280
        ],
        [
          380,
          200
        ]
      ],
      [
        [
          380,
          200
        ],
        [
          380,
          115
        ],
        [
          380,
          275
        ],
        [
          410,
          285
        ]
      ]
    ]
  },
  {
    "id": "lc_e",
    "stars": 4,
    "char": "e",
    "title": "MALÉ PSACÍ e",
    "spoken": "malé psací e",
    "prompt": "Napiš malé psací e! Malá smyčka mezi podlahou a trávou s ocáskem pro další písmenko.",
    "strokes": [
      [
        [
          315,
          280
        ],
        [
          365,
          195
        ],
        [
          350,
          195
        ],
        [
          330,
          245
        ],
        [
          350,
          285
        ],
        [
          400,
          285
        ]
      ]
    ]
  },
  {
    "id": "lc_l",
    "stars": 4,
    "char": "l",
    "title": "MALÉ PSACÍ l",
    "spoken": "malé psací l",
    "prompt": "Napiš malé psací l! Jedna velká štíhlá smyčka od země až k mráčkům a zpět na zem.",
    "strokes": [
      [
        [
          320,
          285
        ],
        [
          360,
          115
        ],
        [
          345,
          115
        ],
        [
          345,
          275
        ],
        [
          380,
          285
        ]
      ]
    ]
  },
  {
    "id": "lc_m",
    "stars": 4,
    "char": "m",
    "title": "MALÉ PSACÍ m",
    "spoken": "malé psací m",
    "prompt": "Napiš malé psací m! Tři spojené kopečky se sklonem a ocáskem.",
    "strokes": [
      [
        [
          310,
          265
        ],
        [
          320,
          200
        ],
        [
          330,
          280
        ],
        [
          340,
          205
        ],
        [
          365,
          200
        ],
        [
          370,
          280
        ],
        [
          380,
          205
        ],
        [
          405,
          200
        ],
        [
          410,
          275
        ],
        [
          430,
          285
        ]
      ]
    ]
  },
  {
    "id": "lc_o",
    "stars": 4,
    "char": "o",
    "title": "MALÉ PSACÍ o",
    "spoken": "malé psací o",
    "prompt": "Napiš malé psací o! Kulaté bříško a nahoře malá vázací mistička.",
    "strokes": [
      [
        [
          315,
          270
        ],
        [
          345,
          195
        ],
        [
          375,
          195
        ],
        [
          335,
          205
        ],
        [
          330,
          245
        ],
        [
          345,
          280
        ],
        [
          380,
          280
        ],
        [
          380,
          200
        ],
        [
          410,
          200
        ]
      ]
    ]
  },
  {
    "id": "lc_p",
    "stars": 4,
    "char": "p",
    "title": "MALÉ PSACÍ p",
    "spoken": "malé psací p",
    "prompt": "Napiš malé psací p! Náběh k trávě, rovný seskok hluboko pod zem ke kotvě a bříško s ocáskem.",
    "strokes": [
      [
        [
          315,
          280
        ],
        [
          350,
          195
        ],
        [
          350,
          375
        ]
      ],
      [
        [
          350,
          235
        ],
        [
          380,
          195
        ],
        [
          400,
          235
        ],
        [
          380,
          280
        ],
        [
          350,
          280
        ],
        [
          390,
          285
        ]
      ]
    ]
  },
  {
    "id": "lc_r",
    "stars": 4,
    "char": "r",
    "title": "MALÉ PSACÍ r",
    "spoken": "malé psací r",
    "prompt": "Napiš malé psací r! Náběh nahoru, malý schůdek a sjezd dolů na podlahu s ocáskem.",
    "strokes": [
      [
        [
          315,
          280
        ],
        [
          350,
          195
        ],
        [
          380,
          195
        ],
        [
          380,
          275
        ],
        [
          410,
          285
        ]
      ]
    ]
  },
  {
    "id": "lc_s",
    "stars": 4,
    "char": "s",
    "title": "MALÉ PSACÍ s",
    "spoken": "malé psací s",
    "prompt": "Napiš malé psací s! Šikmý náběh k trávě, bříško a zpátečka k zemi.",
    "strokes": [
      [
        [
          315,
          280
        ],
        [
          360,
          195
        ],
        [
          385,
          240
        ],
        [
          350,
          285
        ],
        [
          400,
          285
        ]
      ]
    ]
  },
  {
    "id": "lc_t",
    "stars": 4,
    "char": "t",
    "title": "MALÉ PSACÍ t",
    "spoken": "malé psací t",
    "prompt": "Napiš malé psací t! Vysoká hůlka z podlahy k mráčkům a zpět s ocáskem a vodorovná čárka.",
    "strokes": [
      [
        [
          320,
          280
        ],
        [
          360,
          130
        ],
        [
          360,
          275
        ],
        [
          390,
          285
        ]
      ],
      [
        [
          335,
          185
        ],
        [
          385,
          185
        ]
      ]
    ]
  },
  {
    "id": "lc_u",
    "stars": 4,
    "char": "u",
    "title": "MALÉ PSACÍ u",
    "spoken": "malé psací u",
    "prompt": "Napiš malé psací u! Dvě spojená údolíčka s ocáskem.",
    "strokes": [
      [
        [
          315,
          280
        ],
        [
          345,
          195
        ],
        [
          345,
          275
        ],
        [
          365,
          285
        ],
        [
          385,
          200
        ],
        [
          385,
          275
        ],
        [
          410,
          285
        ]
      ]
    ]
  },
  {
    "id": "lc_v",
    "stars": 4,
    "char": "v",
    "title": "MALÉ PSACÍ v",
    "spoken": "malé psací v",
    "prompt": "Napiš malé psací v! Údolíčko s horní vázací mističkou.",
    "strokes": [
      [
        [
          315,
          280
        ],
        [
          340,
          195
        ],
        [
          350,
          275
        ],
        [
          380,
          285
        ],
        [
          395,
          205
        ],
        [
          415,
          205
        ]
      ]
    ]
  },
  {
    "id": "lc_z",
    "stars": 4,
    "char": "z",
    "title": "MALÉ PSACÍ z",
    "spoken": "malé psací z",
    "prompt": "Napiš malé psací z! Horní vlnka a velká smyčka hluboko pod linku ke kotvě.",
    "strokes": [
      [
        [
          315,
          280
        ],
        [
          345,
          195
        ],
        [
          380,
          195
        ],
        [
          335,
          285
        ],
        [
          370,
          285
        ],
        [
          360,
          370
        ],
        [
          330,
          370
        ],
        [
          345,
          310
        ],
        [
          395,
          285
        ]
      ]
    ]
  },
  {
    "id": "cw_pes",
    "stars": 5,
    "char": "pes",
    "title": "SLOVO „PES“",
    "spoken": "slovo pes",
    "prompt": "Napiš psací slovo PES! Písmenko P sjede pod linku ke kotvě, E udělá smyčku a S uzavře slovo ocáskem.",
    "strokes": [
      [
        [
          180,
          280
        ],
        [
          215,
          195
        ],
        [
          215,
          375
        ]
      ],
      [
        [
          215,
          235
        ],
        [
          245,
          195
        ],
        [
          265,
          235
        ],
        [
          245,
          280
        ],
        [
          215,
          280
        ],
        [
          255,
          285
        ],
        [
          315,
          195
        ],
        [
          300,
          195
        ],
        [
          285,
          245
        ],
        [
          305,
          285
        ],
        [
          360,
          285
        ],
        [
          405,
          195
        ],
        [
          430,
          240
        ],
        [
          395,
          285
        ],
        [
          455,
          285
        ]
      ]
    ]
  },
  {
    "id": "cw_les",
    "stars": 5,
    "char": "les",
    "title": "SLOVO „LES“",
    "spoken": "slovo les",
    "prompt": "Napiš psací slovo LES! Vysoká smyčka L k mráčkům, malé E a krásný hadík S.",
    "strokes": [
      [
        [
          220,
          285
        ],
        [
          270,
          115
        ],
        [
          255,
          115
        ],
        [
          255,
          275
        ],
        [
          305,
          285
        ],
        [
          345,
          195
        ],
        [
          330,
          195
        ],
        [
          315,
          245
        ],
        [
          335,
          285
        ],
        [
          390,
          285
        ],
        [
          430,
          195
        ],
        [
          455,
          240
        ],
        [
          420,
          285
        ],
        [
          475,
          285
        ]
      ]
    ]
  },
  {
    "id": "cw_mama",
    "stars": 5,
    "char": "máma",
    "title": "SLOVO „MÁMA“",
    "spoken": "slovo máma",
    "prompt": "Napiš psací slovo MÁMA! Spoj kopečky M, bříško Á s čárkou a zopakuj to!",
    "strokes": [
      [
        [
          140,
          265
        ],
        [
          150,
          200
        ],
        [
          160,
          280
        ],
        [
          170,
          205
        ],
        [
          195,
          200
        ],
        [
          200,
          280
        ],
        [
          210,
          205
        ],
        [
          235,
          200
        ],
        [
          240,
          275
        ],
        [
          265,
          285
        ]
      ],
      [
        [
          300,
          195
        ],
        [
          265,
          205
        ],
        [
          255,
          245
        ],
        [
          270,
          280
        ],
        [
          300,
          280
        ],
        [
          305,
          200
        ],
        [
          305,
          275
        ],
        [
          330,
          285
        ]
      ],
      [
        [
          280,
          150
        ],
        [
          295,
          125
        ]
      ],
      [
        [
          335,
          265
        ],
        [
          345,
          200
        ],
        [
          355,
          280
        ],
        [
          365,
          205
        ],
        [
          390,
          200
        ],
        [
          395,
          280
        ],
        [
          405,
          205
        ],
        [
          430,
          200
        ],
        [
          435,
          275
        ],
        [
          460,
          285
        ]
      ],
      [
        [
          495,
          195
        ],
        [
          460,
          205
        ],
        [
          450,
          245
        ],
        [
          465,
          280
        ],
        [
          495,
          280
        ],
        [
          500,
          200
        ],
        [
          500,
          275
        ],
        [
          525,
          285
        ]
      ]
    ]
  },
  {
    "id": "cw_tata",
    "stars": 5,
    "char": "táta",
    "title": "SLOVO „TÁTA“",
    "spoken": "slovo táta",
    "prompt": "Napiš psací slovo TÁTA! Dvě vysoké hůlky T a dvě spojená A s čárkou.",
    "strokes": [
      [
        [
          195,
          280
        ],
        [
          235,
          130
        ],
        [
          235,
          275
        ],
        [
          265,
          285
        ]
      ],
      [
        [
          210,
          185
        ],
        [
          260,
          185
        ]
      ],
      [
        [
          305,
          195
        ],
        [
          270,
          205
        ],
        [
          260,
          245
        ],
        [
          275,
          280
        ],
        [
          305,
          280
        ],
        [
          310,
          200
        ],
        [
          310,
          275
        ],
        [
          335,
          285
        ]
      ],
      [
        [
          285,
          150
        ],
        [
          300,
          125
        ]
      ],
      [
        [
          340,
          280
        ],
        [
          380,
          130
        ],
        [
          380,
          275
        ],
        [
          410,
          285
        ]
      ],
      [
        [
          355,
          185
        ],
        [
          405,
          185
        ]
      ],
      [
        [
          450,
          195
        ],
        [
          415,
          205
        ],
        [
          405,
          245
        ],
        [
          420,
          280
        ],
        [
          450,
          280
        ],
        [
          455,
          200
        ],
        [
          455,
          275
        ],
        [
          480,
          285
        ]
      ]
    ]
  },
  {
    "id": "cw_ryba",
    "stars": 5,
    "char": "ryba",
    "title": "SLOVO „RYBA“",
    "spoken": "slovo ryba",
    "prompt": "Napiš psací slovo RYBA! R na zemi, Y jde pod linku ke kotvě, B se smyčkou a A na konci.",
    "strokes": [
      [
        [
          180,
          280
        ],
        [
          215,
          195
        ],
        [
          245,
          195
        ],
        [
          245,
          275
        ],
        [
          270,
          285
        ]
      ],
      [
        [
          275,
          280
        ],
        [
          295,
          200
        ],
        [
          300,
          275
        ],
        [
          320,
          285
        ],
        [
          335,
          205
        ],
        [
          335,
          370
        ],
        [
          310,
          370
        ],
        [
          325,
          310
        ],
        [
          355,
          285
        ]
      ],
      [
        [
          360,
          285
        ],
        [
          405,
          115
        ],
        [
          390,
          115
        ],
        [
          390,
          280
        ],
        [
          430,
          280
        ],
        [
          435,
          235
        ],
        [
          455,
          235
        ]
      ],
      [
        [
          495,
          195
        ],
        [
          460,
          205
        ],
        [
          450,
          245
        ],
        [
          465,
          280
        ],
        [
          495,
          280
        ],
        [
          500,
          200
        ],
        [
          500,
          275
        ],
        [
          525,
          285
        ]
      ]
    ]
  },
  {
    "id": "cw_dum",
    "stars": 5,
    "char": "dům",
    "title": "SLOVO „DŮM“",
    "spoken": "slovo dům",
    "prompt": "Napiš psací slovo DŮM! Vysoké D, Ů s kroužkem nahoře a tři kopečky M.",
    "strokes": [
      [
        [
          215,
          200
        ],
        [
          190,
          215
        ],
        [
          185,
          255
        ],
        [
          205,
          280
        ],
        [
          235,
          280
        ],
        [
          240,
          200
        ],
        [
          240,
          115
        ],
        [
          240,
          275
        ],
        [
          270,
          285
        ]
      ],
      [
        [
          275,
          280
        ],
        [
          300,
          200
        ],
        [
          300,
          275
        ],
        [
          320,
          285
        ],
        [
          340,
          200
        ],
        [
          340,
          275
        ],
        [
          365,
          285
        ]
      ],
      [
        [
          320,
          140
        ],
        [
          310,
          155
        ],
        [
          320,
          170
        ],
        [
          330,
          155
        ],
        [
          320,
          140
        ]
      ],
      [
        [
          370,
          265
        ],
        [
          380,
          200
        ],
        [
          390,
          280
        ],
        [
          400,
          205
        ],
        [
          425,
          200
        ],
        [
          430,
          280
        ],
        [
          440,
          205
        ],
        [
          465,
          200
        ],
        [
          470,
          275
        ],
        [
          495,
          285
        ]
      ]
    ]
  },
  {
    "id": "cw_leto",
    "stars": 5,
    "char": "léto",
    "title": "SLOVO „LÉTO“",
    "spoken": "slovo léto",
    "prompt": "Napiš psací slovo LÉTO! Vysoká smyčka L s čárkou, malé E, hůlka T a kulaté O.",
    "strokes": [
      [
        [
          190,
          285
        ],
        [
          235,
          115
        ],
        [
          220,
          115
        ],
        [
          220,
          275
        ],
        [
          250,
          285
        ]
      ],
      [
        [
          255,
          150
        ],
        [
          270,
          125
        ]
      ],
      [
        [
          255,
          280
        ],
        [
          295,
          195
        ],
        [
          280,
          195
        ],
        [
          265,
          245
        ],
        [
          285,
          285
        ],
        [
          320,
          285
        ]
      ],
      [
        [
          325,
          280
        ],
        [
          365,
          130
        ],
        [
          365,
          275
        ],
        [
          395,
          285
        ]
      ],
      [
        [
          340,
          185
        ],
        [
          390,
          185
        ]
      ],
      [
        [
          400,
          270
        ],
        [
          425,
          195
        ],
        [
          455,
          195
        ],
        [
          415,
          205
        ],
        [
          410,
          245
        ],
        [
          425,
          280
        ],
        [
          460,
          280
        ],
        [
          460,
          200
        ],
        [
          485,
          200
        ]
      ]
    ]
  },
  {
    "id": "cw_auto",
    "stars": 5,
    "char": "auto",
    "title": "SLOVO „AUTO“",
    "spoken": "slovo auto",
    "prompt": "Napiš psací slovo AUTO! Bříško A, údolíčko U, hůlka T a kulaté O.",
    "strokes": [
      [
        [
          185,
          270
        ],
        [
          215,
          195
        ],
        [
          250,
          195
        ],
        [
          210,
          205
        ],
        [
          200,
          245
        ],
        [
          215,
          280
        ],
        [
          250,
          280
        ],
        [
          250,
          200
        ],
        [
          250,
          275
        ],
        [
          275,
          285
        ]
      ],
      [
        [
          280,
          280
        ],
        [
          305,
          200
        ],
        [
          305,
          275
        ],
        [
          325,
          285
        ],
        [
          345,
          200
        ],
        [
          345,
          275
        ],
        [
          370,
          285
        ]
      ],
      [
        [
          375,
          280
        ],
        [
          415,
          130
        ],
        [
          415,
          275
        ],
        [
          445,
          285
        ]
      ],
      [
        [
          390,
          185
        ],
        [
          440,
          185
        ]
      ],
      [
        [
          450,
          270
        ],
        [
          475,
          195
        ],
        [
          505,
          195
        ],
        [
          465,
          205
        ],
        [
          460,
          245
        ],
        [
          475,
          280
        ],
        [
          510,
          280
        ],
        [
          510,
          200
        ],
        [
          535,
          200
        ]
      ]
    ]
  },
  {
    "id": "cw_nos",
    "stars": 5,
    "char": "nos",
    "title": "SLOVO „NOS“",
    "spoken": "slovo nos",
    "prompt": "Napiš psací slovo NOS! Dva kopečky N, kulaté O a hadík S.",
    "strokes": [
      [
        [
          220,
          265
        ],
        [
          230,
          200
        ],
        [
          240,
          280
        ],
        [
          250,
          205
        ],
        [
          275,
          200
        ],
        [
          280,
          275
        ],
        [
          305,
          285
        ]
      ],
      [
        [
          310,
          270
        ],
        [
          335,
          195
        ],
        [
          365,
          195
        ],
        [
          325,
          205
        ],
        [
          320,
          245
        ],
        [
          335,
          280
        ],
        [
          370,
          280
        ],
        [
          370,
          200
        ],
        [
          395,
          200
        ]
      ],
      [
        [
          400,
          280
        ],
        [
          440,
          195
        ],
        [
          465,
          240
        ],
        [
          430,
          285
        ],
        [
          480,
          285
        ]
      ]
    ]
  },
  {
    "id": "cw_sova",
    "stars": 5,
    "char": "sova",
    "title": "SLOVO „SOVA“",
    "spoken": "slovo sova",
    "prompt": "Napiš psací slovo SOVA! Psací S, kulaté O, údolíčko V a bříško A.",
    "strokes": [
      [
        [
          190,
          280
        ],
        [
          230,
          195
        ],
        [
          255,
          240
        ],
        [
          220,
          285
        ],
        [
          270,
          285
        ]
      ],
      [
        [
          275,
          270
        ],
        [
          300,
          195
        ],
        [
          330,
          195
        ],
        [
          290,
          205
        ],
        [
          285,
          245
        ],
        [
          300,
          280
        ],
        [
          335,
          280
        ],
        [
          335,
          200
        ],
        [
          360,
          200
        ]
      ],
      [
        [
          365,
          280
        ],
        [
          385,
          195
        ],
        [
          395,
          275
        ],
        [
          425,
          285
        ],
        [
          440,
          205
        ],
        [
          460,
          205
        ]
      ],
      [
        [
          495,
          195
        ],
        [
          460,
          205
        ],
        [
          450,
          245
        ],
        [
          465,
          280
        ],
        [
          495,
          280
        ],
        [
          500,
          200
        ],
        [
          500,
          275
        ],
        [
          525,
          285
        ]
      ]
    ]
  },
  {
    "id": "cw_oko",
    "stars": 5,
    "char": "oko",
    "title": "SLOVO „OKO“",
    "spoken": "slovo oko",
    "prompt": "Napiš psací slovo OKO! Kulaté O, vysoké K a další kulaté O.",
    "strokes": [
      [
        [
          220,
          270
        ],
        [
          245,
          195
        ],
        [
          275,
          195
        ],
        [
          235,
          205
        ],
        [
          230,
          245
        ],
        [
          245,
          280
        ],
        [
          280,
          280
        ],
        [
          280,
          200
        ],
        [
          305,
          200
        ]
      ],
      [
        [
          315,
          110
        ],
        [
          315,
          285
        ]
      ],
      [
        [
          360,
          195
        ],
        [
          315,
          245
        ],
        [
          365,
          285
        ],
        [
          385,
          285
        ]
      ],
      [
        [
          390,
          270
        ],
        [
          415,
          195
        ],
        [
          445,
          195
        ],
        [
          405,
          205
        ],
        [
          400,
          245
        ],
        [
          415,
          280
        ],
        [
          450,
          280
        ],
        [
          450,
          200
        ],
        [
          475,
          200
        ]
      ]
    ]
  },
  {
    "id": "cw_kocka",
    "stars": 5,
    "char": "kočka",
    "title": "SLOVO „KOČKA“",
    "spoken": "slovo kočka",
    "prompt": "Napiš psací slovo KOČKA! Vysoké K, kulaté O, Č s háčkem, K a zakončovací A.",
    "strokes": [
      [
        [
          155,
          110
        ],
        [
          155,
          285
        ]
      ],
      [
        [
          200,
          195
        ],
        [
          155,
          245
        ],
        [
          205,
          285
        ],
        [
          225,
          285
        ]
      ],
      [
        [
          230,
          270
        ],
        [
          255,
          195
        ],
        [
          285,
          195
        ],
        [
          245,
          205
        ],
        [
          240,
          245
        ],
        [
          255,
          280
        ],
        [
          290,
          280
        ],
        [
          290,
          200
        ],
        [
          315,
          200
        ]
      ],
      [
        [
          320,
          280
        ],
        [
          365,
          195
        ],
        [
          340,
          205
        ],
        [
          330,
          245
        ],
        [
          345,
          280
        ],
        [
          380,
          285
        ]
      ],
      [
        [
          345,
          155
        ],
        [
          355,
          170
        ],
        [
          365,
          155
        ]
      ],
      [
        [
          395,
          110
        ],
        [
          395,
          285
        ]
      ],
      [
        [
          440,
          195
        ],
        [
          395,
          245
        ],
        [
          445,
          285
        ],
        [
          465,
          285
        ]
      ],
      [
        [
          495,
          195
        ],
        [
          465,
          205
        ],
        [
          455,
          245
        ],
        [
          470,
          280
        ],
        [
          495,
          280
        ],
        [
          500,
          200
        ],
        [
          500,
          275
        ],
        [
          525,
          285
        ]
      ]
    ]
  }
];

  class HandwritingActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.activity = activity;
      this.level = level;
      this.mascot = mascot;
      this.store = store;
      this.onComplete = onComplete;

      const star = Math.max(1, Math.min(5, this.level.stars || 1));
      const pool = HANDWRITING_CATALOG.filter((item) => item.stars === star);
      this.allCards = shuffleArray(pool.length ? pool : HANDWRITING_CATALOG);
      this.cardIdx = 0;

      this.activeColor = "#1D3557"; // školní inkoustová modř
      this.brushSize = 9;
      this.zoomScale = 1.0;
      this.zoomSteps = [1.0, 1.25, 1.5, 1.8, 2.2];
      this.demoAnimId = null;
      this.demoPt = null;

      this.loadCard(this.allCards[0]);
    }

    loadCard(cfg) {
      this.stopStrokeDemo();
      this.currentConfig = cfg;
      this.strokes = (cfg.strokes || []).map((waypoints, sIdx) => {
        const pts = interpolateStrokePoints(waypoints, 16);
        return {
          strokeIdx: sIdx,
          waypoints,
          points: pts,
          checkpoints: pts.map(([x, y]) => ({ x, y, hit: false })),
          completed: false
        };
      });
      this.currentStrokeIdx = 0;
      this.completed = false;
      this.isDrawing = false;
      this.lastPt = null;

      this.render();
      this.redraw();

      const spokenIntro = cfg.prompt || `Pojďme psát ${cfg.spoken || cfg.title}!`;
      this.mascot.audio.speakCustom(spokenIntro, `✍️ ${cfg.title}: ${cfg.char}`);
    }

    nextCard() {
      this.mascot.audio.playSfx("pop");
      this.cardIdx = (this.cardIdx + 1) % this.allCards.length;
      if (this.cardIdx === 0) {
        this.allCards = shuffleArray(this.allCards);
      }
      this.loadCard(this.allCards[this.cardIdx]);
    }

    setZoom(scale) {
      this.zoomScale = scale;
      const pct = Math.round(scale * 100);
      const badge = document.getElementById("hw-zoom-badge");
      if (badge) badge.textContent = `${pct}%`;
      if (this.canvas) {
        this.canvas.style.transform = `scale(${scale})`;
        this.canvas.style.transformOrigin = "center center";
      }
    }

    stopStrokeDemo() {
      if (this.demoAnimId) {
        cancelAnimationFrame(this.demoAnimId);
        this.demoAnimId = null;
      }
      this.demoPt = null;
    }

    playStrokeDemo() {
      this.stopStrokeDemo();
      const allPoints = [];
      this.strokes.forEach((st) => {
        st.points.forEach((pt) => allPoints.push(pt));
      });
      if (!allPoints.length) return;

      this.mascot.audio.playSfx("whoosh");
      let idx = 0;
      const step = () => {
        if (idx >= allPoints.length) {
          this.demoPt = null;
          this.redraw();
          this.mascot.audio.speakCustom("Teď jsi na řadě ty! Veď tužku po lince!");
          return;
        }
        this.demoPt = allPoints[idx];
        this.redraw();
        idx += 2;
        this.demoAnimId = requestAnimationFrame(step);
      };
      this.demoAnimId = requestAnimationFrame(step);
    }

    render() {
      const cfg = this.currentConfig;
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">✍️ ${cfg.title}</h2>
          <div class="workspace-actions">
            <div class="zoom-stepper" title="Nastavení vzdálenosti / přiblížení písanky">
              <button id="btn-hw-zoom-out" class="btn-touch btn-zoom" aria-label="Oddálit">🔍−</button>
              <span id="hw-zoom-badge" class="zoom-badge">${Math.round(this.zoomScale * 100)}%</span>
              <button id="btn-hw-zoom-in" class="btn-touch btn-zoom" aria-label="Přiblížit zblízka">🔍+</button>
            </div>
            <button id="btn-hw-demo" class="btn-touch btn-secondary" title="Přehrát ukázku správného tahu">✨ UKÁZKA TAHU</button>
            <button id="btn-hw-speak" class="btn-touch btn-secondary">🔊 ZADÁNÍ</button>
            <button id="btn-hw-clear" class="btn-touch btn-secondary">🗑️ SMAZAT</button>
            <button id="btn-hw-done" class="btn-touch btn-primary">✅ HOTOVO</button>
          </div>
        </div>
        <div id="hw-studio-layout" class="studio-layout">
          <div class="canvas-frame">
            <canvas id="hw-canvas" class="draw-canvas" width="720" height="460" draggable="false" style="touch-action:none; user-select:none; transform:scale(${this.zoomScale}); transform-origin:center center;"></canvas>
          </div>
          <aside class="studio-sidebar">
            <div class="tool-box">
              <div class="tool-box-title">✒️ VELIKOST PERA</div>
              ${renderPenSizeMarkup(this.brushSize)}
            </div>
            <div class="tool-box">
              <div class="tool-box-title">🌈 RGB KRUH A INKOUSTY</div>
              <div class="rgb-wheel-row">
                <canvas id="hw-rgb-wheel" class="rgb-wheel-canvas" width="92" height="92"></canvas>
                <div class="rgb-wheel-info">
                  <div id="hw-rgb-preview" class="rgb-preview-dot" style="background:${this.activeColor};"></div>
                  <span>Vyber si barvu písma!</span>
                </div>
              </div>
              <div class="swatch-grid">
                ${EXTENDED_SWATCH_PALETTE.map(
                  (c, i) =>
                    `<button class="btn-touch btn-swatch ${c.hex.toLowerCase() === this.activeColor.toLowerCase() ? "active" : ""}" data-hex="${c.hex}" data-name="${c.name}" style="background:${c.hex}" aria-label="${c.name}"></button>`
                ).join("")}
              </div>
            </div>
            <div class="tool-box">
              <div class="tool-box-title">📝 VZOR PÍSMENKA</div>
              <div style="text-align:center; padding:4px 0;">
                <span style="font-size:2.8rem; font-weight:900; color:var(--navy); line-height:1; font-family:'Schoolbell', 'Fredoka', cursive, sans-serif;">${cfg.char}</span>
                <p style="margin:4px 0 0 0; font-weight:800; font-size:0.82rem; color:var(--navy-soft);">${cfg.prompt}</p>
              </div>
            </div>
          </aside>
        </div>
      `;

      this.canvas = document.getElementById("hw-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.paintLayer = document.createElement("canvas");
      this.paintLayer.width = 720;
      this.paintLayer.height = 460;
      this.paintCtx = this.paintLayer.getContext("2d");

      this.bindEvents();
    }

    bindEvents() {
      const getPos = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? this.canvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? this.canvas.height / rect.height : 1;
        return {
          x: (e.clientX - rect.left) * scaleX,
          y: (e.clientY - rect.top) * scaleY
        };
      };

      const drawStrokeSegment = (fromPt, toPt) => {
        this.paintCtx.beginPath();
        this.paintCtx.moveTo(fromPt.x, fromPt.y);
        this.paintCtx.lineTo(toPt.x, toPt.y);
        this.paintCtx.strokeStyle = this.activeColor;
        this.paintCtx.lineWidth = this.brushSize;
        this.paintCtx.lineCap = "round";
        this.paintCtx.lineJoin = "round";
        this.paintCtx.stroke();
      };

      this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      this.canvas.addEventListener("dragstart", (e) => e.preventDefault());

      this.canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        try { this.canvas.setPointerCapture(e.pointerId); } catch (_e) {}
        this.stopStrokeDemo();
        this.isDrawing = true;
        this.lastPt = getPos(e);
        this.paintCtx.beginPath();
        this.paintCtx.arc(this.lastPt.x, this.lastPt.y, this.brushSize / 2, 0, Math.PI * 2);
        this.paintCtx.fillStyle = this.activeColor;
        this.paintCtx.fill();
        this.checkHit(this.lastPt);
        this.redraw();
      });

      this.canvas.addEventListener("pointermove", (e) => {
        if (!this.isDrawing) {
          if (e.buttons === 1) {
            this.isDrawing = true;
            this.lastPt = getPos(e);
          } else {
            return;
          }
        }
        e.preventDefault();
        const pt = getPos(e);
        if (!this.lastPt) this.lastPt = pt;
        drawStrokeSegment(this.lastPt, pt);
        this.checkHit(pt);
        this.lastPt = pt;
        this.redraw();
      });

      const stop = (e) => {
        if (!this.isDrawing) return;
        if (e && e.pointerId !== undefined) {
          try {
            if (this.canvas.hasPointerCapture(e.pointerId)) {
              this.canvas.releasePointerCapture(e.pointerId);
            }
          } catch (_e) {}
        }
        this.isDrawing = false;
        this.lastPt = null;
        this.evaluateStrokeProgress();
      };

      this.canvas.addEventListener("pointerup", stop);
      this.canvas.addEventListener("pointercancel", stop);
      this.canvas.addEventListener("lostpointercapture", stop);

      // Zoom Stepper
      document.getElementById("btn-hw-zoom-in").addEventListener("click", () => {
        const next = this.zoomSteps.find((s) => s > this.zoomScale) || this.zoomSteps[this.zoomSteps.length - 1];
        this.setZoom(next);
        this.mascot.audio.playSfx("pop");
      });
      document.getElementById("btn-hw-zoom-out").addEventListener("click", () => {
        const prev = [...this.zoomSteps].reverse().find((s) => s < this.zoomScale) || this.zoomSteps[0];
        this.setZoom(prev);
        this.mascot.audio.playSfx("pop");
      });

      // Ukázka tahu
      document.getElementById("btn-hw-demo").addEventListener("click", () => {
        this.playStrokeDemo();
      });

      // Zvuk zadání
      document.getElementById("btn-hw-speak").addEventListener("click", () => {
        const prompt = this.currentConfig.prompt || `Napiš ${this.currentConfig.spoken || this.currentConfig.char}!`;
        this.mascot.audio.speakCustom(prompt, prompt);
      });

      // Smazat plátno
      document.getElementById("btn-hw-clear").addEventListener("click", () => {
        this.paintCtx.clearRect(0, 0, 720, 460);
        this.strokes.forEach((st) => {
          st.completed = false;
          st.checkpoints.forEach((c) => (c.hit = false));
        });
        this.currentStrokeIdx = 0;
        this.completed = false;
        this.redraw();
        this.mascot.audio.playSfx("pop");
      });

      // Hotovo
      document.getElementById("btn-hw-done").addEventListener("click", () => {
        this.finishCard();
      });

      // RGB kruh
      const rgbPreview = document.getElementById("hw-rgb-preview");
      mountRgbColorWheel(document.getElementById("hw-rgb-wheel"), rgbPreview, (hex) => {
        this.activeColor = hex;
        this.hostEl.querySelectorAll(".btn-swatch").forEach((x) => x.classList.remove("active"));
      });

      // Swatches
      this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => {
        b.addEventListener("click", () => {
          this.hostEl.querySelectorAll(".btn-swatch").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          this.activeColor = b.dataset.hex;
          if (rgbPreview) rgbPreview.style.background = this.activeColor;
          this.mascot.audio.playSfx("pop");
          if (b.dataset.name) this.mascot.audio.speakCustom(b.dataset.name);
        });
      });

      // Velikost pera (čisté ikony s tečkou)
      this.hostEl.querySelectorAll(".btn-pen-size").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.hostEl.querySelectorAll(".btn-pen-size").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.brushSize = Number(btn.dataset.penSize) || 9;
          this.mascot.audio.playSfx("pop");
          if (btn.dataset.spoken) this.mascot.audio.speakCustom(btn.dataset.spoken);
        });
      });
    }

    checkHit(pt) {
      const active = this.strokes[this.currentStrokeIdx];
      if (!active || active.completed) return;
      active.checkpoints.forEach((cp) => {
        if (!cp.hit && Math.hypot(cp.x - pt.x, cp.y - pt.y) < 38) {
          cp.hit = true;
        }
      });
    }

    evaluateStrokeProgress() {
      const active = this.strokes[this.currentStrokeIdx];
      if (!active || active.completed) return;
      const hitCount = active.checkpoints.filter((c) => c.hit).length;
      const ratio = hitCount / Math.max(1, active.checkpoints.length);
      if (ratio >= 0.70) {
        active.completed = true;
        this.mascot.audio.playSfx("snap");
        if (this.currentStrokeIdx + 1 < this.strokes.length) {
          this.currentStrokeIdx++;
          this.mascot.audio.speakCustom("Výborně! Pokračuj dalším tahem!");
        } else {
          this.finishCard();
        }
      }
    }

    finishCard() {
      if (this.completed) return;
      this.completed = true;
      this.stopStrokeDemo();
      this.redraw();
      this.store.addArtwork(`Psaní: ${this.currentConfig.char}`, this.canvas.toDataURL("image/png"));
      this.mascot.celebrate("celebrate_04");
      this.onComplete();
      showContinueBanner(this.hostEl, {
        icon: "✍️",
        title: `SKVĚLE NAPSÁNO: „${this.currentConfig.char}“!`,
        subtitle: "Nádherná práce s tužkou v písance! Pojďme na další písmenko!",
        spokenText: `Výborně! Nádherně jsi napsal ${this.currentConfig.spoken || this.currentConfig.char}! Pojďme na další!`,
        nextLabel: "▶️ DALŠÍ PÍSMENKO ➔",
        onNext: () => this.nextCard()
      });
    }

    redraw() {
      const ctx = this.ctx;
      drawHandwritingPaper(ctx, 720, 460);

      // Vodicí linie písmenka na písance
      ctx.save();
      this.strokes.forEach((stroke, idx) => {
        const waypts = stroke.waypoints;
        if (!waypts || waypts.length < 2) return;

        // Již dokončené tahy
        if (stroke.completed) {
          ctx.strokeStyle = "rgba(46, 204, 113, 0.4)";
          ctx.lineWidth = 12;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.setLineDash([]);
          ctx.beginPath();
          waypts.forEach(([x, y], i) => {
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
          return;
        }

        // Aktuální nebo následující tah
        const isCurrent = idx === this.currentStrokeIdx;
        ctx.strokeStyle = isCurrent ? "rgba(144, 224, 239, 0.9)" : "rgba(203, 213, 225, 0.6)";
        ctx.lineWidth = 14;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        waypts.forEach(([x, y], i) => {
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Zelená startovní tečka na začátku tahu s číslem
        if (isCurrent && !this.completed) {
          const [sx, sy] = waypts[0];
          ctx.setLineDash([]);
          // Zářící vnější prstenec
          ctx.fillStyle = "rgba(16, 185, 129, 0.35)";
          ctx.beginPath();
          ctx.arc(sx, sy, 18, 0, Math.PI * 2);
          ctx.fill();
          // Zelená tečka
          ctx.fillStyle = "#10B981";
          ctx.beginPath();
          ctx.arc(sx, sy, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 2.5;
          ctx.stroke();
          // Číslo tahu
          ctx.fillStyle = "#FFFFFF";
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(stroke.strokeIdx + 1), sx, sy);

          // Směrová šipečka, pokud má tah další body
          if (waypts.length > 1) {
            const [nx, ny] = waypts[1];
            const angle = Math.atan2(ny - sy, nx - sx);
            const ax = sx + Math.cos(angle) * 25;
            const ay = sy + Math.sin(angle) * 25;
            ctx.fillStyle = "#059669";
            ctx.beginPath();
            ctx.arc(ax, ay, 4.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
      ctx.restore();

      // Vlastní písmo dítěte
      ctx.drawImage(this.paintLayer, 0, 0);

      // Pokud běží animace ukázky tahu: vykreslíme zářící hrot pera
      if (this.demoPt) {
        ctx.save();
        ctx.fillStyle = "#FFB703";
        ctx.beginPath();
        ctx.arc(this.demoPt[0], this.demoPt[1], 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.font = "24px sans-serif";
        ctx.fillText("✍️", this.demoPt[0] + 8, this.demoPt[1] - 8);
        ctx.restore();
      }
    }

    destroy() {
      this.stopStrokeDemo();
      this.mascot.clearInactivityTimer();
    }
  }

  const StoryDrawActivity = HandwritingActivity;

  // --- AKTIVITA 5: SPOJOVAČKY S ODHALENÍM (25 ŠABLON + SPOJOVÁNÍ NA PŘESKÁČKU) ---
  function buildDotTemplates() {
    const base = [
      { title: "ZÁŘIVÁ HVĚZDIČKA", emoji: "⭐", color: "#FFB703", pts: [[360, 65], [420, 180], [550, 195], [450, 280], [480, 405], [360, 340], [240, 405], [270, 280], [170, 195], [300, 180]] },
      { title: "POLÁRNÍ DOMEČEK", emoji: "🏠", color: "#06D6A0", pts: [[360, 70], [520, 190], [480, 190], [480, 385], [240, 385], [240, 190], [200, 190]] },
      { title: "PLACHETNICE", emoji: "⛵", color: "#118AB2", pts: [[350, 70], [490, 260], [350, 260], [540, 285], [470, 380], [250, 380], [180, 285], [350, 260]] },
      { title: "KRÁLOVSKÁ KORUNA", emoji: "👑", color: "#F77F00", pts: [[180, 350], [160, 145], [265, 235], [360, 95], [455, 235], [560, 145], [540, 350]] },
      { title: "KOUZELNÉ SRDÍČKO", emoji: "❤️", color: "#FF5D8F", pts: [[360, 145], [450, 75], [550, 140], [530, 260], [360, 395], [190, 260], [170, 140], [270, 75]] },
      { title: "ZELENÝ STROMEČEK", emoji: "🌲", color: "#2A9D8F", pts: [[360, 60], [490, 210], [430, 210], [530, 340], [395, 340], [395, 410], [325, 410], [325, 340], [190, 340], [290, 210], [230, 210]] },
      { title: "VESMÍRNÁ RAKETA", emoji: "🚀", color: "#E63946", pts: [[360, 55], [435, 160], [435, 310], [505, 385], [415, 360], [305, 360], [215, 385], [285, 310], [285, 160]] },
      { title: "TŘPYTIVÝ DIAMANT", emoji: "💎", color: "#4CC9F0", pts: [[260, 110], [460, 110], [550, 200], [360, 395], [170, 200]] },
      { title: "PAPÍROVÝ DRAK", emoji: "🪁", color: "#7209B7", pts: [[360, 65], [510, 210], [360, 385], [210, 210]] },
      { title: "ZLATÁ RYBIČKA", emoji: "🐟", color: "#F77F00", pts: [[160, 225], [290, 120], [440, 150], [495, 225], [585, 145], [565, 305], [495, 225], [440, 300], [290, 330]] },
      { title: "MODRÁ VELRYBA", emoji: "🐳", color: "#118AB2", pts: [[175, 260], [220, 145], [380, 145], [475, 240], [575, 175], [555, 315], [465, 315], [200, 315]] },
      { title: "BLESK Z BOUŘKY", emoji: "⚡", color: "#FFB703", pts: [[410, 65], [240, 235], [355, 235], [285, 405], [495, 205], [375, 205]] },
      { title: "SLADKÁZMRZLINA", emoji: "🍦", color: "#FF5D8F", pts: [[275, 210], [310, 115], [360, 85], [410, 115], [445, 210], [360, 405]] },
      { title: "ROZKVETLÝ TULIPÁN", emoji: "🌷", color: "#E63946", pts: [[250, 120], [315, 195], [360, 110], [405, 195], [470, 120], [450, 285], [360, 330], [270, 285]] },
      { title: "MĚSÍČEK NA OBLOZE", emoji: "🌙", color: "#FFB703", pts: [[430, 80], [280, 130], [230, 235], [280, 345], [430, 385], [345, 300], [325, 235], [345, 165]] },
      { title: "MOTÝLEK EMANUEL", emoji: "🦋", color: "#7209B7", pts: [[360, 160], [495, 85], [535, 205], [485, 345], [360, 275], [235, 345], [185, 205], [225, 85]] },
      { title: "POHÁDKOVÝ HRAD", emoji: "🏰", color: "#F77F00", pts: [[180, 380], [180, 140], [235, 90], [290, 140], [290, 230], [430, 230], [430, 140], [485, 90], [540, 140], [540, 380]] },
      { title: "ZLATÝ ZVONEČEK", emoji: "🔔", color: "#FFB703", pts: [[360, 80], [450, 145], [495, 320], [225, 320], [270, 145]] },
      { title: "LESNÍ HŘÍBEK", emoji: "🍄", color: "#E63946", pts: [[200, 225], [275, 110], [445, 110], [520, 225], [415, 225], [415, 385], [305, 385], [305, 225]] },
      { title: "VESELÉ AUTÍČKO", emoji: "🚗", color: "#06D6A0", pts: [[175, 315], [195, 225], [275, 145], [445, 145], [515, 225], [545, 315]] },
      { title: "KOČIČÍ HLAVIČKA", emoji: "🐱", color: "#F4A261", pts: [[240, 100], [310, 165], [410, 165], [480, 100], [500, 275], [360, 370], [220, 275]] },
      { title: "ŠŤAVNATÉ JABLÍČKO", emoji: "🍎", color: "#E63946", pts: [[360, 135], [465, 115], [515, 225], [455, 365], [360, 345], [265, 365], [205, 225], [255, 115]] },
      { title: "DEŠTNÍK DO DEŠTĚ", emoji: "☂️", color: "#4CC9F0", pts: [[180, 240], [255, 130], [360, 95], [465, 130], [540, 240], [360, 240], [360, 385]] },
      { title: "HORKOVZDUŠNÝ BALÓN", emoji: "🎈", color: "#FF5D8F", pts: [[275, 110], [360, 75], [445, 110], [480, 210], [405, 330], [395, 395], [325, 395], [315, 330], [240, 210]] },
      { title: "SNĚHOVÁ VLOČKA", emoji: "❄️", color: "#118AB2", pts: [[360, 75], [465, 135], [510, 235], [465, 335], [360, 395], [255, 335], [210, 235], [255, 135]] }
    ];
    return base;
  }

  const DOT_TO_DOT_TEMPLATES = buildDotTemplates();

  class ConnectDotsActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.useLetters = (level.stars || 1) >= 3 || Boolean(level.config.letters);
      this.deck = shuffleArray(DOT_TO_DOT_TEMPLATES);
      this.tplIdx = 0;
      this.loadTemplate(0);
    }

    loadTemplate(idx) {
      this.tplIdx = idx % this.deck.length;
      if (this.tplIdx === 0 && idx > 0) {
        this.deck = shuffleArray(this.deck);
      }
      this.tpl = this.deck[this.tplIdx];
      this.connectedSet = new Set();
      this.finished = false;
      this.render();
      this.mascot.audio.speakCustom(
        `Spojovačka ${this.tpl.title}! Ťukej na body popořadě nebo klidně i na přeskáčku a odhal obrázek!`,
        `✨ SPOJ VŠECHNY BODY: ${this.tpl.title}`
      );
    }

    nextTemplate() {
      this.mascot.audio.playSfx("pop");
      this.loadTemplate(this.tplIdx + 1);
    }

    labelFor(i) {
      return this.useLetters ? String.fromCharCode(65 + i) : String(i + 1);
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">✨ SPOJOVAČKA: ${this.tpl.title}</h2>
          <div class="workspace-actions">
            <span class="step-pill current" id="dots-status">SPOJENO BODŮ: 0 / ${this.tpl.pts.length} (LZE I NA PŘESKÁČKU)</span>
          </div>
        </div>
        <div class="tangram-board-wrap">
          <canvas id="dots-canvas" class="draw-canvas" width="720" height="440" style="touch-action:none;"></canvas>
        </div>
      `;

      this.canvas = document.getElementById("dots-canvas");
      this.ctx = this.canvas.getContext("2d");

      const handlePoint = (e) => {
        if (this.finished) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / (rect.width || 1)) * this.canvas.width;
        const y = ((e.clientY - rect.top) / (rect.height || 1)) * this.canvas.height;

        // Umožníme spojování bodů v libovolném pořadí (na přeskáčku)!
        for (let i = 0; i < this.tpl.pts.length; i++) {
          if (this.connectedSet.has(i)) continue;
          const [tx, ty] = this.tpl.pts[i];
          if (Math.hypot(x - tx, y - ty) < 46) {
            this.connectedSet.add(i);
            const lbl = this.labelFor(i);
            this.mascot.audio.playSfx("count");
            this.mascot.audio.speakCustom(lbl, `BOD ${lbl}`);
            this.draw();

            const statusEl = document.getElementById("dots-status");
            if (statusEl) {
              statusEl.textContent = `SPOJENO BODŮ: ${this.connectedSet.size} / ${this.tpl.pts.length}`;
            }

            if (this.connectedSet.size >= this.tpl.pts.length) {
              this.finished = true;
              this.draw();
              this.mascot.celebrate("celebrate_01");
              this.onComplete();
              showContinueBanner(this.hostEl, {
                icon: this.tpl.emoji,
                title: `${this.tpl.title} JE NA SVĚTĚ!`,
                subtitle: "Všechny body jsou spojené! Pojďme odhalit další tajný obrázek!",
                spokenText: `Paráda! ${this.tpl.title} je na světě! Pojďme na další spojovačku!`,
                nextLabel: "▶️ DALŠÍ SPOJOVAČKA ➔",
                onNext: () => this.nextTemplate()
              });
            }
            break;
          }
        }
      };

      this.canvas.addEventListener("pointerdown", handlePoint);
      this.canvas.addEventListener("pointermove", (e) => {
        if (e.buttons === 1) handlePoint(e);
      });

      this.draw();
    }

    draw() {
      const ctx = this.ctx;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, 720, 440);

      const n = this.tpl.pts.length;

      // Vykreslíme spojené úsečky mezi sousedními body (nebo celý tvar po dokončení)
      ctx.save();
      ctx.strokeStyle = this.tpl.color;
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (this.finished) {
        ctx.beginPath();
        this.tpl.pts.forEach(([x, y], i) => {
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = this.tpl.color + "44";
        ctx.fill();
        ctx.stroke();
      } else {
        for (let i = 0; i < n; i++) {
          const next = (i + 1) % n;
          if (this.connectedSet.has(i) && this.connectedSet.has(next)) {
            ctx.beginPath();
            ctx.moveTo(this.tpl.pts[i][0], this.tpl.pts[i][1]);
            ctx.lineTo(this.tpl.pts[next][0], this.tpl.pts[next][1]);
            ctx.stroke();
          }
        }
      }
      ctx.restore();

      // Body
      const nextSuggested = this.tpl.pts.findIndex((_, idx) => !this.connectedSet.has(idx));
      this.tpl.pts.forEach(([x, y], i) => {
        const isDone = this.connectedSet.has(i);
        const isSuggested = i === nextSuggested && !this.finished;
        ctx.beginPath();
        ctx.arc(x, y, isSuggested ? 25 : 21, 0, Math.PI * 2);
        ctx.fillStyle = isDone ? "#06D6A0" : isSuggested ? "#FFB703" : "#E6F4FC";
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = isSuggested ? "#F77F00" : "#1D3557";
        ctx.stroke();

        ctx.fillStyle = isDone ? "#FFFFFF" : "#1D3557";
        ctx.font = "900 18px Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.labelFor(i), x, y);
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 7: HLEDAČ STÍNŮ A SILUET (36 POLOŽEK + LIBOVOLNÉ POŘADÍ) ---
  const SHADOW_ITEMS_POOL = [
    { emoji: "🐧", name: "TUČŇÁK" },
    { emoji: "🦊", name: "LIŠKA" },
    { emoji: "🐳", name: "VELRYBA" },
    { emoji: "🦉", name: "SOVA" },
    { emoji: "🦋", name: "MOTÝL" },
    { emoji: "🐢", name: "ŽELVA" },
    { emoji: "🐙", name: "CHOBOTNICE" },
    { emoji: "🦀", name: "KRAB" },
    { emoji: "🐸", name: "ŽÁBA" },
    { emoji: "🚀", name: "RAKETA" },
    { emoji: "⛵", name: "PLACHETNICE" },
    { emoji: "⛄", name: "SNĚHULÁK" },
    { emoji: "🎄", name: "STROMEČEK" },
    { emoji: "🎸", name: "KYTARA" },
    { emoji: "🐘", name: "SLON" },
    { emoji: "🦁", name: "LEV" },
    { emoji: "🦒", name: "ŽIRAFA" },
    { emoji: "🦓", name: "ZEBRA" },
    { emoji: "🦘", name: "KLOKAN" },
    { emoji: "🐊", name: "KROKODÝL" },
    { emoji: "🦕", name: "DINOSAURUS" },
    { emoji: "🦄", name: "JEDNOROŽEC" },
    { emoji: "🐝", name: "VČELKA" },
    { emoji: "🐞", name: "BERUŠKA" },
    { emoji: "🐌", name: "ŠNEČEK" },
    { emoji: "🚁", name: "VRTULNÍK" },
    { emoji: "🚂", name: "LOKOMOTIVA" },
    { emoji: "🚜", name: "TRAKTOR" },
    { emoji: "🏰", name: "HRAD" },
    { emoji: "👑", name: "KORUNA" },
    { emoji: "☂️", name: "DEŠTNÍK" },
    { emoji: "🎈", name: "BALÓNEK" },
    { emoji: "🌵", name: "KAKTUS" },
    { emoji: "🍄", name: "HŘÍBEK" },
    { emoji: "🍍", name: "ANANAS" },
    { emoji: "🎺", name: "TRUBKA" }
  ];

  class ShadowMatchActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.pool = shuffleArray(SHADOW_ITEMS_POOL);
      this.cursor = 0;
      this.nextRound();
    }

    nextRound() {
      const stars = this.level.stars || 1;
      const count = Math.min(7, stars + 2); // 1★=3, 2★=4, 3★=5, 4★=6, 5★=7
      if (this.cursor + count > this.pool.length) {
        this.pool = shuffleArray(SHADOW_ITEMS_POOL);
        this.cursor = 0;
      }
      this.items = this.pool.slice(this.cursor, this.cursor + count);
      this.cursor += count;
      this.shadows = shuffleArray(this.items);
      this.matched = new Set();
      this.render();
      this.mascot.audio.speakCustom(
        "Najdi správný stín! Přetáhni barevný obrázek na jeho stín v libovolném pořadí!",
        "🌗 PŘETÁHNI OBRÁZEK NA JEHO STÍN (LZE I NA PŘESKÁČKU)!"
      );
    }

    tryMatch(pickEmoji, shadowEmoji, targetEl) {
      if (pickEmoji === shadowEmoji) {
        this.matched.add(pickEmoji);
        const item = this.items.find((i) => i.emoji === pickEmoji);
        this.mascot.audio.playSfx("snap");
        this.mascot.emitParticles(["⭐", "✨"]);
        if (item) {
          this.mascot.audio.speakCustom(`Správně! To je ${item.name}!`, `✅ ${item.emoji} ${item.name}`);
        }
        this.render();
        if (this.matched.size === this.items.length) {
          this.mascot.celebrate(this.level.successAudioId || "celebrate_02");
          this.onComplete();
          showContinueBanner(this.hostEl, {
            icon: "🌗",
            title: "VŠECHNY STÍNY JSOU SPOJENÉ!",
            subtitle: "Skvělé oko! Pojďme najít stíny pro další obrázky!",
            spokenText: "Výborně! Všechny stíny jsou nalezeny! Pojďme na další stíny!",
            nextLabel: "▶️ DALŠÍ STÍNY ➔",
            onNext: () => this.nextRound()
          });
        }
      } else {
        if (targetEl) targetEl.classList.add("gentle-nudge-anim");
        this.mascot.gentleNudge("hint_shape_size");
      }
    }

    render() {
      const stars = this.level.stars || 1;
      const rotated = stars >= 3 || Boolean(this.level.config.rotated);
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🌗 PŘETÁHNI OBRÁZEK NA SPRÁVNÝ STÍN!</h2>
          <div class="workspace-actions">
            <span class="step-pill current">NALEZENO: ${this.matched.size} / ${this.items.length}</span>
          </div>
        </div>
        <div class="interactive-stage">
          <div style="font-weight:900; color:var(--navy-soft);">PŘETÁHNI PRSTEM BAREVNÝ OBRÁZEK DOLE NA JEHO STÍN NAHOŘE (I NA PŘESKÁČKU):</div>
          <div class="cards-grid">
            ${this.shadows
              .map((it, idx) => {
                const isDone = this.matched.has(it.emoji);
                const rotAngle = stars >= 4 ? (idx % 2 === 0 ? 35 : -35) : 18;
                const rot = rotated && !isDone ? `rotate(${rotAngle}deg)` : "none";
                return `
                  <div class="game-card ${isDone ? "matched" : ""}" data-shadow="${it.emoji}">
                    <span class="game-card-emoji ${isDone ? "" : "silhouette-emoji"}" style="transform:${rot}">${it.emoji}</span>
                    <span class="game-card-label">${isDone ? it.name : "❓ STÍN"}</span>
                  </div>
                `;
              })
              .join("")}
          </div>
          <div class="cards-grid">
            ${this.items
              .map((it) => {
                const isDone = this.matched.has(it.emoji);
                return `
                  <div class="game-card ${isDone ? "matched" : ""}" data-pick="${it.emoji}" style="${isDone ? "pointer-events:none;" : "cursor:grab;"}">
                    <span class="game-card-emoji">${it.emoji}</span>
                    <span class="game-card-label">${it.name}</span>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      `;

      // Drag and drop: samotné ťuknutí jen přečte název obrázku, přetažení na stín spojí dvojici
      bindPointerDragDrop({
        containerEl: this.hostEl,
        sourceSelector: "[data-pick]",
        targetSelector: "[data-shadow]",
        canDrag: (srcEl) => !this.matched.has(srcEl.dataset.pick),
        onTap: (srcEl) => {
          const item = this.items.find((i) => i.emoji === srcEl.dataset.pick);
          if (item) {
            this.mascot.audio.playSfx("pop");
            this.mascot.audio.speakCustom(item.name);
          }
        },
        onDrop: (srcEl, targetEl) => {
          const pick = srcEl.dataset.pick;
          const shadow = targetEl.dataset.shadow;
          if (!pick || !shadow || this.matched.has(shadow)) return;
          this.tryMatch(pick, shadow, targetEl);
        }
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 8: CO DO OBRÁZKU NEPATŘÍ? (VIZUÁLNÍ DETEKTIV - 25 SCÉN) ---
  const DETECTIVE_SCENES = [
    { title: "ZIMA NA LEDOVCI", normal: ["🐧", "🐻‍❄️", "🦭", "❄️", "⛄"], odd: ["🌴", "🍕", "🚗", "🌵"] },
    { title: "KOŠÍK S OVOCEM", normal: ["🍎", "🍐", "🍌", "🍓", "🍒"], odd: ["👟", "⚽", "🔨", "🧦"] },
    { title: "PODMOŘSKÝ SVĚT", normal: ["🐟", "🐳", "🐙", "🦀", "🐬"], odd: ["🚜", "🌵", "🎸", "🛏️"] },
    { title: "DOPRAVNÍ PROSTŘEDKY", normal: ["🚗", "🚌", "🚂", "✈️", "⛵"], odd: ["🐸", "🍦", "🍄", "🥕"] },
    { title: "LESNÍ ZVÍŘÁTKA", normal: ["🦊", "🦉", "🦌", "🐿️", "🦔"], odd: ["🚀", "📺", "🩱", "🍔"] },
    { title: "HUDEBNÍ KONCERT", normal: ["🎸", "🎺", "🥁", "🎹", "🎻"], odd: ["🥦", "🚜", "🧤", "🐟"] },
    { title: "ZELENINOVÁ ZAHRÁDKA", normal: ["🥕", "🥦", "🥒", "🍅", "🌽"], odd: ["👑", "🎸", "✈️", "🧸"] },
    { title: "VESMÍRNÁ VÝPRAVA", normal: ["🚀", "🪐", "🌟", "🌙", "🛸"], odd: ["🐄", "🍄", "🛷", "🍉"] },
    { title: "ZVÍŘÁTKA NA STATKU", normal: ["🐄", "🐖", "🐑", "🐓", "🐎"], odd: ["🐳", "🛸", "🌵", "🦈"] },
    { title: "SLADKÁ CUKRÁRNA", normal: ["🎂", "🧁", "🍩", "🍦", "🍪"], odd: ["🔨", "🐟", "🚜", "🥾"] },
    { title: "OBLEČENÍ DO ZIMY", normal: ["🧥", "🧤", "🧣", "🧶", "🥾"], odd: ["🍉", "🩱", "🌴", "🦋"] },
    { title: "ROZKVETLÁ LOUKA", normal: ["🌻", "🌷", "🦋", "🐝", "🐞"], odd: ["🛸", "🛋️", "⚓", "🍕"] },
    { title: "ŠKOLNÍ AKTOVKA", normal: ["✏️", "📘", "🖍️", "📏", "✂️"], odd: ["🐸", "🍕", "🛞", "🌵"] },
    { title: "KUCHYŇSKÉ NÁDOBÍ", normal: ["🥄", "🍴", "🍽️", "🥣", "🫖"], odd: ["⚽", "🦉", "🚜", "🌲"] },
    { title: "SPORTOVNÍ HŘIŠTĚ", normal: ["⚽", "🏀", "🎾", "🏐", "🥇"], odd: ["🧁", "🐌", "🛏️", "🍄"] },
    { title: "AFRICKÉ SAFARI", normal: ["🦁", "🐘", "🦒", "🦓", "🦛"], odd: ["⛄", "🐧", "🛷", "🎄"] },
    { title: "KRÁLOVSKÝ ZÁMEK", normal: ["👑", "🏰", "🤴", "👸", "💎"], odd: ["🚜", "🥦", "🐙", "🛞"] },
    { title: "NOČNÍ OBLOHA", normal: ["🌙", "⭐", "🌟", "🪐", "🦉"], odd: ["☀️", "🏖️", "🕶️", "🍦"] },
    { title: "LETNÍ PLÁŽ", normal: ["🏖️", "☀️", "🕶️", "🩱", "🐚"], odd: ["⛄", "🎿", "🧣", "🌨️"] },
    { title: "DĚTSKÝ POKOJÍČEK", normal: ["🧸", "🚂", "🧩", "🪁", "🥁"], odd: ["🦈", "🌵", "🚜", "🌩️"] },
    { title: "PEKÁRNA U PIKA", normal: ["🥐", "🥖", "🥨", "🍞", "🥯"], odd: ["👟", "🎸", "🐸", "☂️"] },
    { title: "POČASÍ NA OBLOZE", normal: ["☀️", "☁️", "🌧️", "🌈", "❄️"], odd: ["🪑", "🍕", "🚗", "🎸"] },
    { title: "HMYZÍ KAMARÁDI", normal: ["🐝", "🐞", "🦋", "🐜", "🦗"], odd: ["🐘", "🚌", "🎂", "👑"] },
    { title: "PTÁČCI NA STROMĚ", normal: ["🦉", "🦅", "🦆", "🦢", "🦜"], odd: ["🐢", "🚗", "🍔", "🎸"] },
    { title: "STAVEBNÍ NÁŘADÍ", normal: ["🔨", "🪛", "🔧", "🪚", "🧱"], odd: ["🍦", "🦋", "🍓", "🎈"] }
  ];

  class VisualDetectiveActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.deck = shuffleArray(DETECTIVE_SCENES);
      this.sceneIdx = 0;
      this.loadScene(0);
    }

    loadScene(idx) {
      this.sceneIdx = idx % this.deck.length;
      if (this.sceneIdx === 0 && idx > 0) {
        this.deck = shuffleArray(this.deck);
      }
      const sc = this.deck[this.sceneIdx];
      const stars = this.level.stars || 1;
      const oddCount = stars === 1 ? 2 : stars <= 3 ? 3 : 4;
      const normalCount = stars <= 2 ? 4 : 5;
      const chosenNormal = shuffleArray(sc.normal).slice(0, normalCount);
      const chosenOdd = shuffleArray(sc.odd).slice(0, Math.min(oddCount, sc.odd.length));

      this.sceneTitle = sc.title;
      this.oddSet = new Set(chosenOdd);
      this.found = new Set();
      this.cards = shuffleArray([...chosenNormal, ...chosenOdd]);
      this.render();
      this.mascot.audio.speakCustom(
        `Detektivní případ: ${this.sceneTitle}! Najdi ${this.oddSet.size} věci, které sem vůbec nepatří!`,
        `🔍 ${this.sceneTitle}: NAJDI ${this.oddSet.size} VĚCI, KTERÉ SEM NEPATŘÍ!`
      );
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🔍 DETEKTIV: ${this.sceneTitle}</h2>
          <div class="workspace-actions">
            <span class="step-pill current">NALEZENO: ${this.found.size} / ${this.oddSet.size}</span>
          </div>
        </div>
        <div class="interactive-stage">
          <div style="font-weight:900; color:var(--navy-soft);">ŤUKNI NA VŠECHNY VĚCI, KTERÉ DO SKUPINY „${this.sceneTitle}“ NEPATŘÍ:</div>
          <div class="cards-grid">
            ${this.cards
              .map((em) => {
                const isFound = this.found.has(em);
                return `
                  <button class="game-card ${isFound ? "correct" : ""}" data-em="${em}">
                    <span class="game-card-emoji">${em}</span>
                    <span class="game-card-label">${isFound ? "✅ NEPATŘÍ" : "❓"}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `;

      this.hostEl.querySelectorAll(".game-card").forEach((btn) => {
        btn.addEventListener("click", () => {
          const em = btn.dataset.em;
          if (this.found.has(em)) return;
          if (this.oddSet.has(em)) {
            this.found.add(em);
            this.mascot.audio.playSfx("snap");
            this.mascot.emitParticles(["🔍", "⭐"]);
            this.mascot.audio.speakCustom("Správně! To sem nepatří!");
            this.render();
            if (this.found.size === this.oddSet.size) {
              this.mascot.celebrate("celebrate_02");
              this.onComplete();
              showContinueBanner(this.hostEl, {
                icon: "🔍",
                title: "VŠECHNY NESMYSLY JSOU ODHALENY!",
                subtitle: "Jsi skvělý detektiv! Vyřešíme další záhadu?",
                spokenText: "Výborně! Všechny nesmysly jsou odhaleny! Pojďme na další pátrání!",
                nextLabel: "▶️ DALŠÍ PÁTRÁNÍ ➔",
                onNext: () => this.loadScene(this.sceneIdx + 1)
              });
            }
          } else {
            btn.classList.add("gentle-nudge-anim");
            this.mascot.audio.speakCustom(`Tohle do skupiny ${this.sceneTitle} patří! Hledej, co sem nepatří!`);
          }
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 9: SKLÁDÁNÍ ROZSTŘÍHANÝCH OBRÁZKŮ (LEDOVÉ PUZZLE - 25 TÉMAT + DRAG & DROP NA PŘESKÁČKU) ---
  const PUZZLE_THEMES = [
    { title: "POLÁRNÍ DRUŽINA", grid: ["☀️", "☁️", "❄️", "🏔️", "🐧", "🐻‍❄️", "🌊", "🐟", "🐳", "🦭", "⛄", "🧊"] },
    { title: "VESMÍRNÁ VÝPRAVA", grid: ["🌟", "🪐", "🌙", "☄️", "🚀", "🛸", "🌍", "👨‍🚀", "⭐", "🌌", "🛰️", "🔭"] },
    { title: "ROZKVETLÁ LOUKA", grid: ["☀️", "🌈", "🦋", "🐝", "🌻", "🌷", "🐞", "🍓", "🍀", "🌼", "🐌", "🍄"] },
    { title: "POHÁDKOVÉ KRÁLOVSTVÍ", grid: ["👑", "✨", "🐉", "🏰", "🤴", "👸", "🦄", "💎", "🛡️", "🗡️", "🐎", "🔮"] },
    { title: "PODMOŘSKÝ ÚTES", grid: ["🐬", "🐳", "🦈", "🐙", "🦀", "🐠", "🐡", "🐚", "🪸", "⚓", "🧜‍♀️", "🌊"] },
    { title: "AFRICKÉ SAFARI", grid: ["☀️", "🌴", "🦁", "🐘", "🦒", "🦓", "🦛", "🦏", "🐊", "🦩", "🐒", "🦜"] },
    { title: "VESELÁ FARMA", grid: ["🏡", "🚜", "🐄", "🐖", "🐑", "🐓", "🐎", "🦆", "🌾", "🥕", "🌻", "🐕"] },
    { title: "LESNÍ KRÁLOVSTVÍ", grid: ["🌲", "🌳", "🦊", "🦉", "🦌", "🐿️", "🦔", "🐻", "🍄", "🌰", "🫐", "🐰"] },
    { title: "DOPRAVNÍ SVĚT", grid: ["✈️", "🚁", "🚂", "🚗", "🚌", "🚒", "🚑", "🚓", "⛵", "🚢", "🚲", "🚦"] },
    { title: "HUDEBNÍ ORCHESTR", grid: ["🎼", "🎵", "🎹", "🎸", "🎺", "🎻", "🥁", "🎷", "🪈", "🔔", "🎤", "🎶"] },
    { title: "SLADKÁ CUKRÁRNA", grid: ["🎂", "🧁", "🍩", "🍦", "🍭", "🍬", "🍫", "🍪", "🥐", "🍓", "🍒", "🥞"] },
    { title: "OVOCNÝ SAD", grid: ["🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍒", "🍑", "🍍", "🥝"] },
    { title: "ZELENINOVÁ ZAHRADA", grid: ["🥕", "🥦", "🥒", "🍅", "🌽", "🫑", "🍆", "🥔", "🧅", "🧄", "🥬", "🎃"] },
    { title: "DINOSAUŘÍ PARK", grid: ["🌋", "🌴", "🦕", "🦖", "🥚", "🦴", "🌿", "🪨", "☀️", "🦎", "🐢", "🐊"] },
    { title: "ZIMNÍ RADOVÁNKY", grid: ["❄️", "🌨️", "⛄", "🛷", "🎿", "⛸️", "🧤", "🧣", "🧥", "🏔️", "🌲", "☕"] },
    { title: "LETNÍ PRÁZDNINY", grid: ["☀️", "🏖️", "🌊", "⛵", "🏄", "🕶️", "🩱", "🍦", "🍉", "🐚", "🦀", "🌴"] },
    { title: "NAROZENINOVÁ OSLAVA", grid: ["🎈", "🎉", "🎊", "🎁", "🎂", "🕯️", "🥳", "👑", "🍰", "🍭", "🎵", "⭐"] },
    { title: "HASIČSKÁ STANICE", grid: ["🚒", "👨‍🚒", "🚨", "🧯", "🪜", "💧", "🏠", "🐱", "🌳", "🐕", "⭐", "🛡️"] },
    { title: "STAVENIŠTĚ", grid: ["🏗️", "🚜", "🚛", "🧱", "🔨", "🔧", "🪚", "🪛", "👷", "🏠", "🏢", "🚧"] },
    { title: "KOUZELNICKÁ ŠKOLA", grid: ["🎩", "🪄", "🔮", "✨", "🦉", "📜", "🧪", "💎", "🌙", "⭐", "🏰", "🕯️"] },
    { title: "SPORTOVNÍ OLYMPIÁDA", grid: ["🏆", "🥇", "⚽", "🏀", "🎾", "🏐", "🏈", "⚾", "🏊", "🚴", "🤸", "🎯"] },
    { title: "PIRÁTSKÁ VÝPRAVA", grid: ["🏴‍☠️", "⛵", "⚓", "🗺️", "🧭", "💎", "🪙", "🦜", "🏝️", "🌊", "🦈", "🔭"] },
    { title: "DĚTSKÉ HŘIŠTĚ", grid: ["🛝", "🎡", "🎢", "🎠", "🎈", "🪁", "⚽", "🛴", "🚲", "🍦", "☀️", "🌳"] },
    { title: "PODZIMNÍ PROCHÁZKA", grid: ["🍁", "🍂", "🍄", "🌰", "🦔", "🐿️", "🦉", "🌧️", "☂️", "🎃", "🍎", "🌲"] },
    { title: "JARNÍ PROBUZENÍ", grid: ["🌱", "🌷", "🌼", "🌸", "☀️", "🌈", "🐣", "🐰", "🐝", "🦋", "🐞", "🍀"] }
  ];

  class PuzzleActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.deck = shuffleArray(PUZZLE_THEMES);
      this.themeIdx = 0;
      this.loadPuzzle(0);
    }

    loadPuzzle(idx) {
      this.themeIdx = idx % this.deck.length;
      if (this.themeIdx === 0 && idx > 0) {
        this.deck = shuffleArray(this.deck);
      }
      this.theme = this.deck[this.themeIdx];
      const stars = this.level.stars || 1;
      const counts = { 1: 4, 2: 6, 3: 6, 4: 9, 5: 12 };
      this.count = counts[stars] || 6;
      this.targetTiles = this.theme.grid.slice(0, this.count).map((em, i) => ({ pos: i + 1, emoji: em }));
      this.placed = new Array(this.count).fill(null);
      this.tray = shuffleArray(this.targetTiles);
      this.render();
      this.mascot.audio.speakCustom(
        `Slož puzzle ${this.theme.title}! Přetáhni prstem libovolný dílek na jeho správné místo v rámečku!`,
        `🧩 PŘETÁHNI DÍLKY DO RÁMEČKU: ${this.theme.title}`
      );
    }

    tryPlace(tile, slotIdx, slotEl) {
      if (tile.pos === slotIdx + 1) {
        this.placed[slotIdx] = tile;
        this.mascot.audio.playSfx("snap");
        this.mascot.emitParticles(["🧩", "⭐"]);
        this.render();
        if (this.placed.every(Boolean)) {
          this.mascot.celebrate("celebrate_01");
          this.onComplete();
          showContinueBanner(this.hostEl, {
            icon: "🧩",
            title: `PUZZLE „${this.theme.title}“ JE KOMPLETNÍ!`,
            subtitle: "Všechny dílky do sebe krásně zapadly! Poskládáme další obrázek?",
            spokenText: `Výborně! Puzzle ${this.theme.title} je kompletní! Pojďme na další puzzle!`,
            nextLabel: "▶️ DALŠÍ PUZZLE ➔",
            onNext: () => this.loadPuzzle(this.themeIdx + 1)
          });
        }
      } else {
        if (slotEl) slotEl.classList.add("gentle-nudge-anim");
        this.mascot.gentleNudge("hint_shape_size");
      }
    }

    render() {
      const cols = this.count === 4 ? 2 : this.count === 12 ? 4 : 3;
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🧩 PUZZLE: ${this.theme.title}</h2>
          <div class="workspace-actions">
            <span class="step-pill current">SLOŽENO: ${this.placed.filter(Boolean).length} / ${this.count}</span>
          </div>
        </div>
        <div class="feed-layout">
          <section class="pond-panel" style="align-items:center; justify-content:center;">
            <div class="panel-heading" style="width:100%;"><span>🖼️ RÁMEČEK OBRÁZKU (PŘETÁHNI DÍLKY V LIBOVOLNÉM POŘADÍ)</span></div>
            <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:8px; width:100%; max-width:420px; flex:1; align-items:center;">
              ${this.targetTiles
                .map((t, i) => {
                  const filled = this.placed[i];
                  return `
                    <div class="target-slot ${filled ? "filled" : ""}" data-slot="${i}" style="width:100%; height:100%;">
                      <span style="font-size:clamp(1.4rem, 3.6dvh, 2.3rem); opacity:${filled ? "1" : "0.28"};">${t.emoji}</span>
                      <span style="font-size:0.72rem;">DÍLEK ${t.pos}</span>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </section>
          <section class="bowl-panel" style="justify-content:flex-start;">
            <div class="panel-heading" style="width:100%;"><span>🧩 DÍLKY (PŘETÁHNI DO RÁMEČKU)</span></div>
            <div class="cards-grid">
              ${this.tray
                .map((t) => {
                  const isPlaced = this.placed.some((p) => p && p.pos === t.pos);
                  return `
                    <div class="game-card ${isPlaced ? "matched" : ""}" data-piece="${t.pos}" style="${isPlaced ? "pointer-events:none;" : "cursor:grab;"}">
                      <span class="game-card-emoji">${t.emoji}</span>
                      <span class="game-card-label">DÍLEK ${t.pos}</span>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </section>
        </div>
      `;

      bindPointerDragDrop({
        containerEl: this.hostEl,
        sourceSelector: "[data-piece]",
        targetSelector: "[data-slot]",
        canDrag: (srcEl) => {
          const pos = Number(srcEl.dataset.piece);
          return !this.placed.some((p) => p && p.pos === pos);
        },
        onTap: (srcEl) => {
          const pos = Number(srcEl.dataset.piece);
          this.mascot.audio.playSfx("pop");
          this.mascot.audio.speakCustom(`dílek ${pos}`);
        },
        onDrop: (srcEl, targetEl) => {
          const pos = Number(srcEl.dataset.piece);
          const slotIdx = Number(targetEl.dataset.slot);
          const tile = this.tray.find((x) => x.pos === pos);
          if (!tile || isNaN(slotIdx) || this.placed[slotIdx]) return;
          this.tryPlace(tile, slotIdx, targetEl);
        }
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 11: SKLÁDÁNÍ PRVNÍCH SLOV ZE SLABIK (34 SLOV + PŘIROZENÁ VÝSLOVNOST SLABIK + DRAG & DROP NA PŘESKÁČKU) ---
  const SYLLABLE_WORDS_BANK = [
    { parts: ["MÁ", "MA"], spokenParts: ["má", "ma"], emoji: "👩" },
    { parts: ["TÁ", "TA"], spokenParts: ["tá", "ta"], emoji: "👨" },
    { parts: ["RY", "BA"], spokenParts: ["ry", "ba"], emoji: "🐟" },
    { parts: ["AU", "TO"], spokenParts: ["au", "to"], emoji: "🚗" },
    { parts: ["KO", "LO"], spokenParts: ["ko", "lo"], emoji: "🚲" },
    { parts: ["SO", "VA"], spokenParts: ["so", "va"], emoji: "🦉" },
    { parts: ["ŽÁ", "BA"], spokenParts: ["žá", "ba"], emoji: "🐸" },
    { parts: ["LIŠ", "KA"], spokenParts: ["liš", "ka"], emoji: "🦊" },
    { parts: ["BA", "NÁN"], spokenParts: ["ba", "nán"], emoji: "🍌" },
    { parts: ["KOČ", "KA"], spokenParts: ["koč", "ka"], emoji: "🐱" },
    { parts: ["PEJ", "SEK"], spokenParts: ["pej", "sek"], emoji: "🐶" },
    { parts: ["SLUN", "CE"], spokenParts: ["slun", "ce"], emoji: "☀️" },
    { parts: ["MĚ", "SÍC"], spokenParts: ["mě", "síc"], emoji: "🌙" },
    { parts: ["HVĚZ", "DA"], spokenParts: ["hvěz", "da"], emoji: "⭐" },
    { parts: ["MO", "TÝL"], spokenParts: ["mo", "týl"], emoji: "🦋" },
    { parts: ["VČE", "LA"], spokenParts: ["vče", "la"], emoji: "🐝" },
    { parts: ["KRÁ", "VA"], spokenParts: ["krá", "va"], emoji: "🐄" },
    { parts: ["OV", "CE"], spokenParts: ["ov", "ce"], emoji: "🐑" },
    { parts: ["ZA", "JÍC"], spokenParts: ["za", "jíc"], emoji: "🐰" },
    { parts: ["MED", "VĚD"], spokenParts: ["med", "věd"], emoji: "🐻" },
    { parts: ["TUČ", "ŇÁK"], spokenParts: ["tuč", "ňák"], emoji: "🐧" },
    { parts: ["LOĎ", "KA"], spokenParts: ["loď", "ka"], emoji: "⛵" },
    { parts: ["JA", "HO", "DA"], spokenParts: ["ja", "ho", "da"], emoji: "🍓" },
    { parts: ["KO", "ČIČ", "KA"], spokenParts: ["ko", "čič", "ka"], emoji: "🐱" },
    { parts: ["KO", "RU", "NA"], spokenParts: ["ko", "ru", "na"], emoji: "👑" },
    { parts: ["RA", "KE", "TA"], spokenParts: ["ra", "ke", "ta"], emoji: "🚀" },
    { parts: ["SNĚ", "HU", "LÁK"], spokenParts: ["sně", "hu", "lák"], emoji: "⛄" },
    { parts: ["BE", "RUŠ", "KA"], spokenParts: ["be", "ruš", "ka"], emoji: "🐞" },
    { parts: ["ŽI", "RA", "FA"], spokenParts: ["ži", "ra", "fa"], emoji: "🦒" },
    { parts: ["VE", "VER", "KA"], spokenParts: ["ve", "ver", "ka"], emoji: "🐿️" },
    { parts: ["PA", "POU", "ŠEK"], spokenParts: ["pa", "pou", "šek"], emoji: "🦜" },
    { parts: ["LE", "TA", "DLO"], spokenParts: ["le", "ta", "dlo"], emoji: "✈️" },
    { parts: ["CHO", "BOT", "NI", "CE"], spokenParts: ["cho", "bot", "ni", "ce"], emoji: "🐙" },
    { parts: ["DI", "NO", "SAU", "RUS"], spokenParts: ["di", "no", "sau", "rus"], emoji: "🦕" }
  ];

  class SyllablesActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      const stars = level.stars || 1;
      const filtered = SYLLABLE_WORDS_BANK.filter((w) =>
        stars === 1 ? w.parts.length === 2 : stars >= 4 ? w.parts.length >= 3 : true
      );
      this.deck = shuffleArray(filtered.length ? filtered : SYLLABLE_WORDS_BANK);
      this.wordIdx = 0;
      this.loadWord(0);
    }

    loadWord(idx) {
      this.wordIdx = idx % this.deck.length;
      if (this.wordIdx === 0 && idx > 0) {
        this.deck = shuffleArray(this.deck);
      }
      this.current = this.deck[this.wordIdx];
      this.placedSlots = new Array(this.current.parts.length).fill(null);
      this.choices = shuffleArray(
        this.current.parts.map((syl, i) => ({
          syl,
          spoken: (this.current.spokenParts && this.current.spokenParts[i]) || syl.toLowerCase(),
          origIdx: i,
          used: false
        }))
      );
      this.render();
      this.speakTargetWord();
    }

    speakTargetWord() {
      if (this.speechTimer) {
        clearTimeout(this.speechTimer);
        this.speechTimer = null;
      }
      const fullWord = this.current.parts.join("").toLowerCase();
      const syls = (this.current.spokenParts || this.current.parts.map((p) => p.toLowerCase()));
      this.mascot.audio.speakCustom(
        `Poskládej ze slabik slovo ${fullWord}!`,
        `📖 POSKLÁDEJ SLOVO: ${this.current.emoji} ${this.current.parts.join("-")}`
      );
      let delay = 1600;
      syls.forEach((syl, i) => {
        this.speechTimer = setTimeout(() => {
          this.mascot.audio.speakCustom(syl, `SLABIKA ${i + 1}: ${this.current.parts[i]}`);
        }, delay);
        delay += 850;
      });
    }

    render() {
      const fullWord = this.current.parts.join("");
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">📖 PŘETÁHNI SLABIKY DO POLÍČEK (LZE I NA PŘESKÁČKU)</h2>
          <div class="workspace-actions">
            <span class="step-pill current">SLOVO: ${this.placedSlots.filter(Boolean).length} / ${this.current.parts.length}</span>
          </div>
        </div>
        <div class="interactive-stage">
          <div class="word-picture-card" id="syl-word-card">
            <span class="word-emoji">${this.current.emoji}</span>
            <div class="slot-row">
              ${this.current.parts
                .map((_, i) => {
                  const val = this.placedSlots[i] || `${i + 1}. ___`;
                  return `<div class="target-slot ${this.placedSlots[i] ? "filled" : ""}" data-slot="${i}">${val}</div>`;
                })
                .join("")}
            </div>
            <button id="btn-syl-speak" class="btn-touch btn-primary">🔊 PŘEČÍST SLOVO</button>
          </div>
          <div style="font-weight:900; font-size:0.86rem; color:var(--navy-soft);">ŤUKNUTÍ SLABIKU PŘEČTE • PŘETAŽENÍM JI VLOŽÍŠ DO LIBOVOLNÉHO POLÍČKA:</div>
          <div class="letter-choices">
            ${this.choices
              .map(
                (c, idx) =>
                  `<div class="btn-touch btn-letter-choice ${c.used ? "correct" : ""}" data-cidx="${idx}" style="${c.used ? "pointer-events:none; opacity:0.45;" : "cursor:grab;"}">${c.syl}</div>`
              )
              .join("")}
          </div>
        </div>
      `;

      document.getElementById("btn-syl-speak").addEventListener("click", (e) => {
        e.stopPropagation();
        this.mascot.audio.playSfx("pop");
        this.speakTargetWord();
      });

      this.hostEl.querySelectorAll("[data-slot]").forEach((slotEl) => {
        slotEl.addEventListener("click", () => {
          const sIdx = Number(slotEl.dataset.slot);
          const spoken =
            (this.current.spokenParts && this.current.spokenParts[sIdx]) ||
            this.current.parts[sIdx].toLowerCase();
          this.mascot.audio.playSfx("pop");
          this.mascot.audio.speakCustom(spoken, `SLABIKA: ${this.current.parts[sIdx]}`);
        });
      });

      // Drag and drop: samotné ťuknutí pouze přečte slabiku, přetažení na libovolný slot ji umístí (i na přeskáčku!)
      bindPointerDragDrop({
        containerEl: this.hostEl,
        sourceSelector: "[data-cidx]",
        targetSelector: "[data-slot]",
        canDrag: (srcEl) => {
          const item = this.choices[Number(srcEl.dataset.cidx)];
          return Boolean(item && !item.used);
        },
        onTap: (srcEl) => {
          const item = this.choices[Number(srcEl.dataset.cidx)];
          if (!item) return;
          this.mascot.audio.playSfx("pop");
          this.mascot.audio.speakCustom(item.spoken, `SLABIKA: ${item.syl}`);
        },
        onDrop: (srcEl, targetEl) => {
          const item = this.choices[Number(srcEl.dataset.cidx)];
          const slotIdx = Number(targetEl.dataset.slot);
          if (!item || item.used || isNaN(slotIdx) || this.placedSlots[slotIdx]) return;

          if (this.current.parts[slotIdx] === item.syl) {
            item.used = true;
            this.placedSlots[slotIdx] = item.syl;
            this.mascot.audio.playSfx("snap");
            this.mascot.audio.speakCustom(item.spoken, `✅ ${item.syl}`);
            this.render();

            if (this.placedSlots.every(Boolean)) {
              this.mascot.celebrate("celebrate_05");
              this.onComplete();
              showContinueBanner(this.hostEl, {
                icon: this.current.emoji,
                title: `VÝBORNĚ! POSKLÁDALI JSME SLOVO „${fullWord}“!`,
                subtitle: "Všechny slabiky jsou na svém místě. Zkusíme další slovo!",
                spokenText: `Výborně! Přečetli jsme slovo ${fullWord.toLowerCase()}! Pojďme na další slovo!`,
                nextLabel: "▶️ DALŠÍ SLOVO ➔",
                onNext: () => this.loadWord(this.wordIdx + 1)
              });
            }
          } else {
            targetEl.classList.add("gentle-nudge-anim");
            this.mascot.audio.speakCustom(
              `Tato slabika je ${item.spoken}. Zkus ji dát na jiné místo!`,
              `🤔 ZKUS JINÉ POLÍČKO`
            );
          }
        }
      });
    }

    destroy() {
      if (this.speechTimer) {
        clearTimeout(this.speechTimer);
        this.speechTimer = null;
      }
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 12: PÍSMENKOVÁ DRÁHA (GRAFOMOTORIKA - 34 ZNAKŮ + NA PŘESKÁČKU) ---
  const GLYPH_TRACKS = [
    { glyph: "A", pts: [[240, 360], [360, 80], [480, 360], [285, 250], [435, 250]] },
    { glyph: "B", pts: [[260, 85], [260, 225], [260, 360], [430, 150], [430, 300]] },
    { glyph: "C", pts: [[450, 110], [310, 95], [245, 225], [310, 355], [450, 335]] },
    { glyph: "D", pts: [[260, 90], [260, 225], [260, 360], [440, 145], [460, 225], [440, 305]] },
    { glyph: "E", pts: [[460, 90], [260, 90], [260, 225], [430, 225], [260, 360], [460, 360]] },
    { glyph: "F", pts: [[450, 90], [265, 90], [265, 220], [420, 220], [265, 360]] },
    { glyph: "G", pts: [[445, 110], [295, 100], [245, 225], [310, 355], [455, 320], [455, 240], [375, 240]] },
    { glyph: "H", pts: [[250, 90], [250, 225], [250, 360], [360, 225], [470, 90], [470, 225], [470, 360]] },
    { glyph: "I", pts: [[360, 90], [360, 180], [360, 270], [360, 360]] },
    { glyph: "J", pts: [[420, 90], [420, 240], [390, 350], [295, 350], [265, 285]] },
    { glyph: "K", pts: [[260, 90], [260, 225], [260, 360], [455, 95], [335, 225], [460, 360]] },
    { glyph: "L", pts: [[270, 80], [270, 220], [270, 360], [460, 360]] },
    { glyph: "M", pts: [[210, 360], [210, 85], [360, 240], [510, 85], [510, 360]] },
    { glyph: "N", pts: [[245, 360], [245, 90], [360, 225], [475, 360], [475, 90]] },
    { glyph: "O", pts: [[360, 80], [475, 220], [360, 360], [245, 220]] },
    { glyph: "P", pts: [[265, 360], [265, 225], [265, 90], [430, 120], [430, 210]] },
    { glyph: "R", pts: [[265, 360], [265, 90], [430, 145], [335, 225], [455, 360]] },
    { glyph: "S", pts: [[450, 110], [330, 85], [265, 165], [455, 275], [340, 365], [250, 330]] },
    { glyph: "T", pts: [[220, 90], [360, 90], [500, 90], [360, 225], [360, 365]] },
    { glyph: "U", pts: [[250, 90], [255, 275], [360, 360], [465, 275], [470, 90]] },
    { glyph: "V", pts: [[235, 90], [295, 225], [360, 360], [425, 225], [485, 90]] },
    { glyph: "X", pts: [[245, 90], [360, 225], [475, 360], [475, 90], [245, 360]] },
    { glyph: "Y", pts: [[245, 90], [360, 220], [475, 90], [360, 290], [360, 365]] },
    { glyph: "Z", pts: [[240, 95], [480, 95], [360, 225], [240, 355], [480, 355]] },
    { glyph: "0", pts: [[360, 85], [460, 225], [360, 360], [260, 225]] },
    { glyph: "1", pts: [[290, 150], [375, 85], [375, 225], [375, 365]] },
    { glyph: "2", pts: [[260, 145], [365, 85], [460, 155], [255, 360], [470, 360]] },
    { glyph: "3", pts: [[265, 105], [450, 135], [345, 220], [460, 305], [265, 355]] },
    { glyph: "4", pts: [[410, 90], [250, 270], [465, 270], [410, 210], [410, 365]] },
    { glyph: "5", pts: [[450, 90], [270, 90], [265, 205], [445, 250], [350, 360], [255, 330]] },
    { glyph: "6", pts: [[420, 90], [270, 215], [355, 360], [455, 285], [355, 215]] },
    { glyph: "7", pts: [[245, 95], [475, 95], [395, 225], [315, 360]] },
    { glyph: "8", pts: [[360, 85], [445, 150], [360, 220], [455, 300], [360, 365], [265, 300], [275, 150]] },
    { glyph: "9", pts: [[445, 165], [355, 85], [265, 165], [355, 235], [435, 240], [315, 365]] }
  ];

  class LetterTrackActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.deck = shuffleArray(GLYPH_TRACKS);
      this.idx = 0;
      this.brushSize = 22;
      this.loadGlyph(0);
    }

    loadGlyph(idx) {
      this.idx = idx % this.deck.length;
      if (this.idx === 0 && idx > 0) {
        this.deck = shuffleArray(this.deck);
      }
      this.track = this.deck[this.idx];
      this.checkpoints = this.track.pts.map(([x, y]) => ({ x, y, hit: false }));
      this.isDrawing = false;
      this.lastPt = null;
      this.done = false;
      this.render();
      this.mascot.audio.speakCustom(
        `Obtáhni prstem dráhu znaku ${this.track.glyph}! Body můžeš spojit v jakémkoli pořadí!`,
        `🛷 OBTÁHNI ZNAK: „${this.track.glyph}“`
      );
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🛷 PÍSMENKOVÁ DRÁHA: ZNAK „${this.track.glyph}“</h2>
          <div class="workspace-actions">
            ${renderPenSizeMarkup(this.brushSize)}
            <button id="btn-lt-speak" class="btn-touch btn-secondary">🔊 PŘEČÍST ZNAK</button>
            <button id="btn-lt-clear" class="btn-touch btn-secondary">SMAZAT</button>
          </div>
        </div>
        <div class="tangram-board-wrap">
          <canvas id="lt-canvas" class="draw-canvas" width="720" height="440" style="touch-action:none;"></canvas>
        </div>
      `;

      this.canvas = document.getElementById("lt-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.paint = document.createElement("canvas");
      this.paint.width = 720;
      this.paint.height = 440;
      this.pCtx = this.paint.getContext("2d");

      this.hostEl.querySelectorAll(".btn-pen-size").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.hostEl.querySelectorAll(".btn-pen-size").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.brushSize = Number(btn.dataset.penSize) || 22;
          this.mascot.audio.playSfx("pop");
          if (btn.dataset.spoken) this.mascot.audio.speakCustom(btn.dataset.spoken);
        });
      });

      document.getElementById("btn-lt-speak").addEventListener("click", () => {
        this.mascot.audio.speakCustom(`znak ${this.track.glyph}`);
      });
      document.getElementById("btn-lt-clear").addEventListener("click", () => this.loadGlyph(this.idx));

      const getPos = (e) => {
        const r = this.canvas.getBoundingClientRect();
        return {
          x: ((e.clientX - r.left) / (r.width || 1)) * 720,
          y: ((e.clientY - r.top) / (r.height || 1)) * 440
        };
      };

      this.canvas.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        try { this.canvas.setPointerCapture(e.pointerId); } catch (_e) {}
        this.isDrawing = true;
        this.lastPt = getPos(e);
        this.pCtx.beginPath();
        this.pCtx.arc(this.lastPt.x, this.lastPt.y, this.brushSize / 2, 0, Math.PI * 2);
        this.pCtx.fillStyle = "#06D6A0";
        this.pCtx.fill();
        this.markHit(this.lastPt);
        this.draw();
        this.checkDone();
      });

      this.canvas.addEventListener("pointermove", (e) => {
        if (!this.isDrawing && e.buttons !== 1) return;
        this.isDrawing = true;
        const pt = getPos(e);
        if (!this.lastPt) this.lastPt = pt;
        this.pCtx.beginPath();
        this.pCtx.moveTo(this.lastPt.x, this.lastPt.y);
        this.pCtx.lineTo(pt.x, pt.y);
        this.pCtx.strokeStyle = "#06D6A0";
        this.pCtx.lineWidth = this.brushSize;
        this.pCtx.lineCap = "round";
        this.pCtx.stroke();
        this.markHit(pt);
        this.lastPt = pt;
        this.draw();
      });

      const end = () => {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        this.lastPt = null;
        this.checkDone();
      };
      this.canvas.addEventListener("pointerup", end);
      this.canvas.addEventListener("pointercancel", end);

      this.draw();
    }

    checkDone() {
      if (!this.done && this.checkpoints.every((c) => c.hit)) {
        this.done = true;
        this.draw();
        this.mascot.celebrate("celebrate_01");
        this.onComplete();
        showContinueBanner(this.hostEl, {
          icon: "🛷",
          title: `ZNAK „${this.track.glyph}“ JE KRÁSNĚ OBTAŽENÝ!`,
          subtitle: "Parádní jízda po ledové dráze! Pojďme obtáhnout další znak!",
          spokenText: `Výborně! Znak ${this.track.glyph} je krásně obtažený! Pojďme na další znak!`,
          nextLabel: "▶️ DALŠÍ ZNAK ➔",
          onNext: () => this.loadGlyph(this.idx + 1)
        });
      }
    }

    markHit(pt) {
      // Body lze projet nebo ťuknout v libovolném pořadí (na přeskáčku)
      this.checkpoints.forEach((c) => {
        if (!c.hit && Math.hypot(c.x - pt.x, c.y - pt.y) < 56) {
          c.hit = true;
          this.mascot.audio.playSfx("count");
        }
      });
    }

    draw() {
      const ctx = this.ctx;
      ctx.fillStyle = "#F0F9FF";
      ctx.fillRect(0, 0, 720, 440);

      // Ledová dráha písmene na pozadí
      ctx.save();
      ctx.font = "900 320px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "#BCE0F5";
      ctx.lineWidth = 38;
      ctx.strokeText(this.track.glyph, 360, 235);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(this.track.glyph, 360, 235);
      ctx.restore();

      ctx.drawImage(this.paint, 0, 0);

      if (!this.done) {
        this.checkpoints.forEach((c, i) => {
          ctx.beginPath();
          ctx.arc(c.x, c.y, 18, 0, Math.PI * 2);
          ctx.fillStyle = c.hit ? "#06D6A0" : "#FFB703";
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#1D3557";
          ctx.stroke();
          ctx.fillStyle = "#1D3557";
          ctx.font = "900 15px Nunito, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(i + 1), c.x, c.y);
        });
      }
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 13: RÝMOVACÍ PEXESO (28 RÝMOVACÍCH DVOJIC = 56 HLASOVĚ ČTENÝCH SLOV) ---
  const RHYME_PAIRS_POOL = [
    { pairId: 1, a: { word: "KOČKA", emoji: "🐱" }, b: { word: "VLOČKA", emoji: "❄️" } },
    { pairId: 2, a: { word: "MYŠ", emoji: "🐭" }, b: { word: "SKRÝŠ", emoji: "🏠" } },
    { pairId: 3, a: { word: "PES", emoji: "🐶" }, b: { word: "LES", emoji: "🌲" } },
    { pairId: 4, a: { word: "DRAK", emoji: "🐉" }, b: { word: "MRAK", emoji: "☁️" } },
    { pairId: 5, a: { word: "HRAD", emoji: "🏰" }, b: { word: "HAD", emoji: "🐍" } },
    { pairId: 6, a: { word: "VLK", emoji: "🐺" }, b: { word: "BRK", emoji: "🪶" } },
    { pairId: 7, a: { word: "SLON", emoji: "🐘" }, b: { word: "ZVON", emoji: "🔔" } },
    { pairId: 8, a: { word: "LIŠKA", emoji: "🦊" }, b: { word: "ŠIŠKA", emoji: "🌰" } },
    { pairId: 9, a: { word: "KRÁL", emoji: "🤴" }, b: { word: "ŠÁL", emoji: "🧣" } },
    { pairId: 10, a: { word: "RŮŽE", emoji: "🌹" }, b: { word: "LOUŽE", emoji: "💧" } },
    { pairId: 11, a: { word: "KOZA", emoji: "🐐" }, b: { word: "VOSA", emoji: "🐝" } },
    { pairId: 12, a: { word: "RAK", emoji: "🦞" }, b: { word: "VLAK", emoji: "🚂" } },
    { pairId: 13, a: { word: "SOVA", emoji: "🦉" }, b: { word: "SLOVA", emoji: "📖" } },
    { pairId: 14, a: { word: "DORT", emoji: "🎂" }, b: { word: "SPORT", emoji: "⚽" } },
    { pairId: 15, a: { word: "LED", emoji: "🧊" }, b: { word: "MED", emoji: "🍯" } },
    { pairId: 16, a: { word: "NOS", emoji: "👃" }, b: { word: "KOS", emoji: "🐦" } },
    { pairId: 17, a: { word: "MÍČ", emoji: "🏐" }, b: { word: "KLÍČ", emoji: "🔑" } },
    { pairId: 18, a: { word: "DŮM", emoji: "🏡" }, b: { word: "STROM", emoji: "🌳" } },
    { pairId: 19, a: { word: "PÁV", emoji: "🦚" }, b: { word: "RUKÁV", emoji: "🧥" } },
    { pairId: 20, a: { word: "KŮŇ", emoji: "🐎" }, b: { word: "TŮŇ", emoji: "🌊" } },
    { pairId: 21, a: { word: "BOTA", emoji: "👟" }, b: { word: "NOTA", emoji: "🎵" } },
    { pairId: 22, a: { word: "Čáp", emoji: "🦩" }, b: { word: "KÁP", emoji: "🌧️" } },
    { pairId: 23, a: { word: "ŽÁBA", emoji: "🐸" }, b: { word: "KÁVA", emoji: "☕" } },
    { pairId: 24, a: { word: "LEV", emoji: "🦁" }, b: { word: "ZPĚV", emoji: "🎤" } },
    { pairId: 25, a: { word: "KVĚT", emoji: "🌸" }, b: { word: "SVĚT", emoji: "🌍" } },
    { pairId: 26, a: { word: "MOST", emoji: "🌉" }, b: { word: "KOST", emoji: "🦴" } },
    { pairId: 27, a: { word: "LOĎ", emoji: "⛵" }, b: { word: "PLOD", emoji: "🍎" } },
    { pairId: 28, a: { word: "MRKEV", emoji: "🥕" }, b: { word: "CÍRKEV", emoji: "⛪" } }
  ];

  class RhymeMemoryActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.pool = shuffleArray(RHYME_PAIRS_POOL);
      this.offset = 0;
      this.startRound();
    }

    startRound() {
      const stars = this.level.stars || 1;
      const count = stars === 1 ? 3 : stars === 2 ? 4 : stars === 3 ? 5 : stars === 4 ? 6 : 7;
      if (this.offset + count > this.pool.length) {
        this.pool = shuffleArray(RHYME_PAIRS_POOL);
        this.offset = 0;
      }
      const chosen = this.pool.slice(this.offset, this.offset + count);
      this.offset += count;
      this.cards = [];
      chosen.forEach((p) => {
        this.cards.push({ id: `${p.pairId}_a`, pairId: p.pairId, ...p.a, matched: false });
        this.cards.push({ id: `${p.pairId}_b`, pairId: p.pairId, ...p.b, matched: false });
      });
      this.cards = shuffleArray(this.cards);
      this.firstCard = null;
      this.render();
      this.mascot.audio.speakCustom(
        "Spoj dva obrázky, které se rýmují! Ťukni na každou kartičku a já ti slovo přečtu nahlas!",
        "🎵 ŤUKNI NA KARTIČKU — PŘEČTU TI SLOVO A NAJDEME RÝM!"
      );
    }

    render() {
      const matchedPairs = this.cards.filter((c) => c.matched).length / 2;
      const totalPairs = this.cards.length / 2;
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🎵 SPOJ DVA OBRÁZKY, KTERÉ SE RÝMUJÍ! (ŤUKNI PRO PŘEČTENÍ)</h2>
          <div class="workspace-actions">
            <span class="step-pill current">PÁRY: ${matchedPairs} / ${totalPairs}</span>
          </div>
        </div>
        <div class="interactive-stage">
          <div class="cards-grid">
            ${this.cards
              .map((c) => {
                const isSel = this.firstCard && this.firstCard.id === c.id;
                return `
                  <button class="game-card ${c.matched ? "matched" : isSel ? "selected" : ""}" data-cid="${c.id}" ${c.matched ? "disabled" : ""}>
                    <span class="game-card-emoji">${c.emoji}</span>
                    <span class="game-card-label">🔊 ${c.word}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `;

      this.hostEl.querySelectorAll("[data-cid]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const card = this.cards.find((c) => c.id === btn.dataset.cid);
          if (!card || card.matched) return;
          this.mascot.audio.playSfx("pop");

          if (!this.firstCard || this.firstCard.id === card.id) {
            this.firstCard = card;
            // Hlasité přečtení prvního vybraného slova
            this.mascot.audio.speakCustom(
              `${card.word}! Najdi obrázek, který se rýmuje se slovem ${card.word}!`,
              `🔊 ${card.emoji} ${card.word}! CO SE S TÍM RÝMUJE?`
            );
            this.render();
            return;
          }

          if (this.firstCard.pairId === card.pairId) {
            const firstWord = this.firstCard.word;
            this.firstCard.matched = true;
            card.matched = true;
            this.firstCard = null;
            this.mascot.audio.playSfx("snap");
            this.mascot.emitParticles(["🎵", "⭐"]);
            this.mascot.audio.speakCustom(
              `${card.word}! Výborně, rýmuje se ${firstWord} a ${card.word}!`,
              `🎵 RÝM: ${firstWord} A ${card.word}!`
            );
            this.render();

            if (this.cards.every((c) => c.matched)) {
              setTimeout(() => {
                this.mascot.celebrate("celebrate_05");
                this.onComplete();
                showContinueBanner(this.hostEl, {
                  icon: "🎵",
                  title: "VŠECHNY RÝMOVACÍ DVOJICE JSOU SPOJENÉ!",
                  subtitle: "To byla krásná básnička! Pojďme najít další rýmy!",
                  spokenText: "Paráda! Všechny rýmy jsou spojené! Pojďme na další rýmování!",
                  nextLabel: "▶️ DALŠÍ RÝMY ➔",
                  onNext: () => this.startRound()
                });
              }, 750);
            }
          } else {
            const firstWord = this.firstCard.word;
            this.firstCard = null;
            btn.classList.add("gentle-nudge-anim");
            this.mascot.audio.speakCustom(
              `${card.word}. Slova ${firstWord} a ${card.word} se spolu nerýmují. Zkus jinou kartičku!`,
              `🔊 ${firstWord} A ${card.word} SE NERÝMUJÍ`
            );
            setTimeout(() => this.render(), 550);
          }
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 15: LEDOVÉ VÁHY (POROVNÁVÁNÍ A VYROVNÁVÁNÍ MNOŽSTVÍ 1★–5★) ---
  const SCALE_ITEMS_POOL = [
    "🧊", "🐟", "🍎", "⭐", "💎", "🍓", "🍌", "🧁", "🎈", "🐚",
    "🍄", "🌰", "🥕", "🍪", "⚽", "🧸", "🎁", "🌸", "🍋", "🍐",
    "🍒", "🥐", "🔔", "🪙", "🍬"
  ];

  class IceScalesActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.itemsDeck = shuffleArray(SCALE_ITEMS_POOL);
      this.taskIdx = 0;
      this.nextTask();
    }

    nextTask() {
      const stars = this.level.stars || 1;
      const maxByStars = { 1: 5, 2: 8, 3: 11, 4: 15, 5: 20 };
      const max = maxByStars[stars] || 6;
      this.itemEmoji = this.itemsDeck[this.taskIdx % this.itemsDeck.length];
      this.taskIdx += 1;
      this.leftCount = 2 + Math.floor(Math.random() * (max - 2));
      this.rightCount = Math.max(1, (this.leftCount + 2 + Math.floor(Math.random() * 3)) % max);
      if (this.rightCount === this.leftCount) this.rightCount = Math.max(1, this.leftCount - 2);
      this.render();
      this.mascot.audio.speakCustom(
        `Ledové váhy! Vlevo je ${this.leftCount} a vpravo je ${this.rightCount}. Přidej nebo odeber na pravé misce, aby bylo na obou miskách stejně!`,
        `⚖️ VYROVNEJ MISKY NA STEJNÝ POČET (${this.leftCount} = ${this.leftCount})!`
      );
    }

    render() {
      const diff = this.rightCount - this.leftCount;
      const tilt = Math.max(-14, Math.min(14, diff * 3.5));
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">⚖️ LEDOVÉ VÁHY: VYROVNEJ OBĚ MISKY NA STEJNÝ POČET!</h2>
          <div class="workspace-actions">
            <span class="step-pill current">VLEVO: ${this.leftCount} • VPRAVO: ${this.rightCount}</span>
          </div>
        </div>
        <div class="interactive-stage">
          <div class="scales-stage" style="transform:rotate(${tilt}deg); transition:transform 0.35s ease;">
            <div class="scale-pan">
              <div style="width:100%; text-align:center; font-weight:900;">LEVÁ MISKA: ${this.leftCount}</div>
              ${Array.from({ length: this.leftCount }).map(() => `<span style="font-size:1.8rem;">${this.itemEmoji}</span>`).join("")}
            </div>
            <div style="font-size:3rem;">⚖️</div>
            <div class="scale-pan">
              <div style="width:100%; text-align:center; font-weight:900;">PRAVÁ MISKA: ${this.rightCount}</div>
              ${Array.from({ length: this.rightCount }).map(() => `<span style="font-size:1.8rem;">${this.itemEmoji}</span>`).join("")}
            </div>
          </div>
          <div style="display:flex; gap:14px; flex-wrap:wrap; justify-content:center;">
            <button id="btn-scale-rem" class="btn-touch btn-secondary">➖ ODEBRAT</button>
            <button id="btn-scale-add" class="btn-touch btn-primary">➕ PŘIDAT</button>
            <button id="btn-scale-ok" class="btn-touch btn-primary" style="background:linear-gradient(135deg,#06d6a0,#10b981);">✅ JE TO STEJNĚ!</button>
          </div>
        </div>
      `;

      document.getElementById("btn-scale-rem").addEventListener("click", () => {
        if (this.rightCount > 0) this.rightCount -= 1;
        this.mascot.audio.playSfx("pop");
        this.mascot.audio.speakCustom(String(this.rightCount));
        this.render();
      });
      document.getElementById("btn-scale-add").addEventListener("click", () => {
        if (this.rightCount < 25) this.rightCount += 1;
        this.mascot.audio.playSfx("count");
        this.mascot.audio.speakCustom(String(this.rightCount));
        this.render();
      });
      document.getElementById("btn-scale-ok").addEventListener("click", () => {
        if (this.leftCount === this.rightCount) {
          this.mascot.celebrate("celebrate_01");
          this.onComplete();
          showContinueBanner(this.hostEl, {
            icon: "⚖️",
            title: `VÁHY JSOU V ROVNOVÁZE (${this.leftCount} = ${this.rightCount})!`,
            subtitle: "Na obou miskách je přesně stejně! Zvážíme další předměty?",
            spokenText: `Výborně! Váhy jsou v rovnováze, na obou miskách je ${this.leftCount}! Pojďme na další vážení!`,
            nextLabel: "▶️ DALŠÍ VÁŽENÍ ➔",
            onNext: () => this.nextTask()
          });
        } else {
          this.mascot.audio.speakCustom(
            `Ještě to není stejně! Vlevo je ${this.leftCount} a vpravo je ${this.rightCount}.`
          );
        }
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 16: PRVNÍ SČÍTÁNÍ A ODČÍTÁNÍ S PŘÍBĚHEM (25 PŘEDMĚTŮ + 1★–5★) ---
  const MATH_STORY_ITEMS = [
    { emoji: "🐧", name: "tučňáků" },
    { emoji: "🐟", name: "rybiček" },
    { emoji: "🍎", name: "jablíček" },
    { emoji: "⭐", name: "hvězdiček" },
    { emoji: "🦋", name: "motýlků" },
    { emoji: "🍓", name: "jahůdek" },
    { emoji: "🍌", name: "banánů" },
    { emoji: "🍐", name: "hrušek" },
    { emoji: "🍒", name: "třešní" },
    { emoji: "🥕", name: "mrkviček" },
    { emoji: "🍄", name: "hříbků" },
    { emoji: "🌸", name: "kytiček" },
    { emoji: "🎈", name: "balónků" },
    { emoji: "🚗", name: "autíček" },
    { emoji: "🚀", name: "raket" },
    { emoji: "⛵", name: "loděk" },
    { emoji: "🧁", name: "dortíků" },
    { emoji: "🍪", name: "sušenek" },
    { emoji: "💎", name: "diamantů" },
    { emoji: "🐚", name: "mušličkek" },
    { emoji: "🐸", name: "žabiček" },
    { emoji: "🐢", name: "želviček" },
    { emoji: "🦉", name: "soviček" },
    { emoji: "🐝", name: "včeliček" },
    { emoji: "🐞", name: "berušek" }
  ];

  class StoryMathActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.itemsDeck = shuffleArray(MATH_STORY_ITEMS);
      this.probIdx = 0;
      this.nextProblem();
    }

    nextProblem() {
      const stars = this.level.stars || 1;
      const maxByStars = { 1: 5, 2: 8, 3: 10, 4: 15, 5: 20 };
      const max = maxByStars[stars] || 6;
      const item = this.itemsDeck[this.probIdx % this.itemsDeck.length];
      this.probIdx += 1;
      this.emoji = item.emoji;
      this.itemName = item.name;
      this.isSubtraction = stars >= 2 && Math.random() > 0.45;
      if (this.isSubtraction) {
        this.a = 3 + Math.floor(Math.random() * Math.max(2, max - 3));
        this.b = 1 + Math.floor(Math.random() * (this.a - 1));
        this.answer = this.a - this.b;
      } else {
        this.a = 1 + Math.floor(Math.random() * Math.max(2, Math.floor(max / 2)));
        this.b = 1 + Math.floor(Math.random() * Math.max(2, max - this.a));
        this.answer = this.a + this.b;
      }
      const choicesCount = stars <= 2 ? 4 : 5;
      const opts = new Set([this.answer]);
      while (opts.size < choicesCount) {
        opts.add(Math.max(1, this.answer + Math.floor(Math.random() * 7) - 3));
      }
      this.choices = [...opts].sort((x, y) => x - y);
      this.render();
      const opWord = this.isSubtraction ? "mínus" : "plus";
      this.mascot.audio.speakCustom(
        `Spočítej příklad: Kolik je ${this.a} ${opWord} ${this.b}?`,
        `➕ KOLIK JE ${this.a} ${this.isSubtraction ? "−" : "+"} ${this.b} ?`
      );
    }

    render() {
      const sign = this.isSubtraction ? "−" : "+";
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">➕ POČÍTÁNÍ S PŘÍBĚHEM: ${this.a} ${sign} ${this.b} = ❓</h2>
          <div class="workspace-actions">
            <button id="btn-math-speak" class="btn-touch btn-secondary">🔊 PŘEČÍST PŘÍKLAD</button>
          </div>
        </div>
        <div class="interactive-stage">
          <div class="word-picture-card" style="gap:16px;">
            <div style="display:flex; gap:5px; flex-wrap:wrap; font-size:clamp(1.6rem, 3.8dvh, 2.2rem);">
              ${Array.from({ length: this.a }).map(() => `<span>${this.emoji}</span>`).join("")}
            </div>
            <span class="word-display" style="letter-spacing:0;">${sign}</span>
            <div style="display:flex; gap:5px; flex-wrap:wrap; font-size:clamp(1.6rem, 3.8dvh, 2.2rem);">
              ${Array.from({ length: this.b }).map(() => `<span style="${this.isSubtraction ? "opacity:0.4;" : ""}">${this.emoji}</span>`).join("")}
            </div>
            <span class="word-display" style="letter-spacing:0;">= ${this.a} ${sign} ${this.b} = ❓</span>
          </div>
          <div class="letter-choices">
            ${this.choices
              .map(
                (num) =>
                  `<button class="btn-touch btn-letter-choice" data-num="${num}">${num}</button>`
              )
              .join("")}
          </div>
        </div>
      `;

      document.getElementById("btn-math-speak").addEventListener("click", () => {
        const opWord = this.isSubtraction ? "mínus" : "plus";
        this.mascot.audio.speakCustom(`Kolik je ${this.a} ${opWord} ${this.b}?`);
      });

      this.hostEl.querySelectorAll("[data-num]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const val = Number(btn.dataset.num);
          if (val === this.answer) {
            btn.classList.add("correct");
            this.mascot.audio.playSfx("snap");
            this.mascot.celebrate("celebrate_02");
            this.onComplete();
            showContinueBanner(this.hostEl, {
              icon: this.emoji,
              title: `SPRÁVNĚ! ${this.a} ${sign} ${this.b} = ${this.answer}!`,
              subtitle: "Jsi skvělý počtář! Spočítáme další příklad?",
              spokenText: `Výborně! Výsledek je ${this.answer}! Pojďme na další příklad!`,
              nextLabel: "▶️ DALŠÍ PŘÍKLAD ➔",
              onNext: () => this.nextProblem()
            });
          } else {
            btn.classList.add("gentle-nudge-anim");
            this.mascot.audio.speakCustom(`Číslo ${val} to není, zkus spočítat obrázky ještě jednou!`);
          }
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 17: SEŘAĎ PODLE VELIKOSTI (28 POLOŽEK + ŘAZENÍ NA PŘESKÁČKU 1★–5★) ---
  const SIZE_SORT_EMOJIS = [
    "🐧", "⛄", "🐟", "🌲", "⭐", "🚀", "🎈", "🍎", "🍐", "🍓",
    "🌻", "🌷", "🍄", "🦋", "🐢", "🐳", "🦉", "🦊", "🐻", "🦁",
    "🐘", "🦒", "🚗", "🚂", "⛵", "🏰", "👑", "💎"
  ];

  class SizeSortActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.deck = shuffleArray(SIZE_SORT_EMOJIS);
      this.themeIdx = 0;
      this.nextRound();
    }

    nextRound() {
      this.emoji = this.deck[this.themeIdx % this.deck.length];
      this.themeIdx += 1;
      const stars = this.level.stars || 1;
      const count = Math.min(7, stars + 2); // 1★=3, 2★=4, 3★=5, 4★=6, 5★=7
      this.sizes = Array.from({ length: count }, (_, i) => i + 1);
      this.pool = shuffleArray(this.sizes);
      this.placedSlots = new Array(count).fill(null);
      this.selectedSlot = null;
      this.selectedSize = null;
      this.render();
      this.mascot.audio.speakCustom(
        "Seřaď obrázky od nejmenšího po největší! Můžeš je dávat do políček popořadě nebo klidně i na přeskáčku!",
        "📏 SEŘAĎ OD NEJMENŠÍHO PO NEJVĚTŠÍ (LZE I NA PŘESKÁČKU)!"
      );
    }

    tryPlaceSize(sz, slotIdx, el) {
      if (sz === slotIdx + 1) {
        this.placedSlots[slotIdx] = sz;
        this.selectedSlot = null;
        this.selectedSize = null;
        this.mascot.audio.playSfx("snap");
        this.mascot.audio.speakCustom(`Místo ${slotIdx + 1}`);
        this.render();
        if (this.placedSlots.every(Boolean)) {
          this.mascot.celebrate("celebrate_01");
          this.onComplete();
          showContinueBanner(this.hostEl, {
            icon: "📏",
            title: "SKVĚLE SEŘAZENO OD NEJMENŠÍHO PO NEJVĚTŠÍ!",
            subtitle: "Všechny velikosti jsou na správném místě! Zkusíme další řadu?",
            spokenText: "Výborně! Všechno je skvěle seřazeno od nejmenšího po největší! Pojďme na další řazení!",
            nextLabel: "▶️ DALŠÍ ŘAZENÍ ➔",
            onNext: () => this.nextRound()
          });
        }
      } else {
        if (el) el.classList.add("gentle-nudge-anim");
        this.mascot.gentleNudge("hint_shape_size");
      }
    }

    render() {
      const doneCount = this.placedSlots.filter(Boolean).length;
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">📏 SEŘAĎ OD NEJMENŠÍHO PO NEJVĚTŠÍ (LZE I NA PŘESKÁČKU)!</h2>
          <div class="workspace-actions">
            <span class="step-pill current">SEŘAZENO: ${doneCount} / ${this.sizes.length}</span>
          </div>
        </div>
        <div class="interactive-stage">
          <div style="font-weight:900; color:var(--navy-soft);">ŤUKNI NA KARTIČKU DOLE (NEBO VYBER POLÍČKO NAHOŘE) V LIBOVOLNÉM POŘADÍ:</div>
          <div class="slot-row">
            ${this.sizes
              .map((sz, i) => {
                const isDone = Boolean(this.placedSlots[i]);
                const isSel = this.selectedSlot === i && !isDone;
                const scale = 0.55 + sz * 0.21;
                return `
                  <button type="button" class="target-slot ${isDone ? "filled" : ""}" data-slot="${i}" style="${isSel ? "border-color:#ffb703; background:#fff9db;" : ""}">
                    ${isDone ? `<span style="font-size:1.9rem; transform:scale(${scale});">${this.emoji}</span>` : `${i + 1}.`}
                  </button>
                `;
              })
              .join("")}
          </div>
          <div class="cards-grid">
            ${this.pool
              .map((sz) => {
                const used = this.placedSlots.includes(sz);
                const isSel = this.selectedSize === sz && !used;
                const scale = 0.55 + sz * 0.21;
                return `
                  <button class="game-card ${used ? "matched" : isSel ? "selected" : ""}" data-sz="${sz}" ${used ? "disabled" : ""}>
                    <span class="game-card-emoji" style="transform:scale(${scale});">${this.emoji}</span>
                    <span class="game-card-label">VELIKOST ${sz}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `;

      this.hostEl.querySelectorAll("[data-slot]").forEach((slotBtn) => {
        slotBtn.addEventListener("click", () => {
          const sIdx = Number(slotBtn.dataset.slot);
          if (this.placedSlots[sIdx]) return;
          this.mascot.audio.playSfx("pop");

          if (this.selectedSize !== null) {
            this.tryPlaceSize(this.selectedSize, sIdx, slotBtn);
          } else {
            this.selectedSlot = sIdx;
            this.mascot.audio.speakCustom(`${sIdx + 1}. místo`);
            this.render();
          }
        });
      });

      this.hostEl.querySelectorAll("[data-sz]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const pickedSz = Number(btn.dataset.sz);
          if (this.placedSlots.includes(pickedSz)) return;

          if (this.selectedSlot !== null && !this.placedSlots[this.selectedSlot]) {
            this.tryPlaceSize(pickedSz, this.selectedSlot, btn);
          } else {
            // Na přeskáčku: ťuknutí na libovolnou velikost ji rovnou umístí do jejího správného políčka (pickedSz - 1)!
            this.tryPlaceSize(pickedSz, pickedSz - 1, btn);
          }
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 18: DOKONČI VZOR (LOGICKÉ ŘADY - 26 SAD + 1★–5★) ---
  const PATTERN_SETS = [
    ["🐟", "❄️", "⭐", "🐚"],
    ["🍎", "🍐", "🍌", "🍓"],
    ["🌞", "🌙", "☁️", "🌈"],
    ["🐧", "🦊", "🦉", "🐻"],
    ["🔴", "🔵", "🟡", "🟢"],
    ["🚗", "🚂", "✈️", "⛵"],
    ["🌻", "🌷", "🌼", "🌹"],
    ["🦋", "🐝", "🐞", "🐌"],
    ["🎸", "🎺", "🥁", "🎹"],
    ["🎂", "🧁", "🍩", "🍦"],
    ["👑", "💎", "🏰", "🛡️"],
    ["⚽", "🏀", "🎾", "🏐"],
    ["🥕", "🥦", "🌽", "🍅"],
    ["🐶", "🐱", "🐰", "🐹"],
    ["🦁", "🐘", "🦒", "🦓"],
    ["🐳", "🐬", "🐙", "🦀"],
    ["🎄", "⛄", "🛷", "🧤"],
    ["🚀", "🪐", "☄️", "🛸"],
    ["🍄", "🌰", "🍁", "🦔"],
    ["🎈", "🎁", "🎉", "🕯️"],
    ["🐸", "🐢", "🐊", "🦎"],
    ["🥐", "🥨", "🥖", "🥞"],
    ["🔔", "🔑", "🧭", "⚓"],
    ["💜", "💙", "💚", "💛"],
    ["🔺", "🔷", "🟢", "⭐"],
    ["🍍", "🍉", "🍒", "🥝"]
  ];

  class PatternCompleteActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.deck = shuffleArray(PATTERN_SETS);
      this.setIdx = 0;
      this.nextPattern();
    }

    nextPattern() {
      const icons = this.deck[this.setIdx % this.deck.length];
      this.setIdx += 1;
      const stars = this.level.stars || 1;
      const [A, B, C, D] = icons;

      if (stars === 1) {
        this.seq = [A, B, A, B, A];
        this.answer = B;
        this.choices = shuffleArray([A, B, C]);
      } else if (stars === 2) {
        this.seq = [A, A, B, B, A];
        this.answer = A;
        this.choices = shuffleArray([A, B, C]);
      } else if (stars === 3) {
        this.seq = [A, B, C, A, B];
        this.answer = C;
        this.choices = shuffleArray([A, B, C, D]);
      } else if (stars === 4) {
        this.seq = [A, B, B, A, B];
        this.answer = B;
        this.choices = shuffleArray([A, B, C, D]);
      } else {
        this.seq = [A, B, C, D, A, B, C];
        this.answer = D;
        this.choices = shuffleArray([A, B, C, D]);
      }
      this.render();
      this.mascot.audio.speakCustom(
        "Dokonči logickou řadu! Podívej se, jak se obrázky střídají, a vyber, co patří na konec!",
        "❄️ CO PATŘÍ NA KONEC LOGICKÉ ŘADY?"
      );
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">❄️ DOKONČI LOGICKOU ŘADU: CO PATŘÍ NA KONEC?</h2>
        </div>
        <div class="interactive-stage">
          <div class="word-picture-card">
            ${this.seq.map((em) => `<span style="font-size:clamp(1.8rem, 4.5dvh, 3rem);">${em}</span>`).join("")}
            <div class="target-slot" id="pat-slot">❓</div>
          </div>
          <div class="letter-choices">
            ${this.choices
              .map(
                (em) =>
                  `<button class="btn-touch btn-letter-choice" data-em="${em}">${em}</button>`
              )
              .join("")}
          </div>
        </div>
      `;

      this.hostEl.querySelectorAll("[data-em]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (btn.dataset.em === this.answer) {
            btn.classList.add("correct");
            document.getElementById("pat-slot").textContent = this.answer;
            document.getElementById("pat-slot").classList.add("filled");
            this.mascot.audio.playSfx("snap");
            this.mascot.celebrate("celebrate_02");
            this.onComplete();
            showContinueBanner(this.hostEl, {
              icon: this.answer,
              title: "LOGICKÁ ŘADA JE SPRÁVNĚ DOKONČENÁ!",
              subtitle: "Skvělá všímavost! Vyluštíme další vzor?",
              spokenText: "Výborně! Vzor je dokončený! Pojďme na další řadu!",
              nextLabel: "▶️ DALŠÍ ŘADA ➔",
              onNext: () => this.nextPattern()
            });
          } else {
            btn.classList.add("gentle-nudge-anim");
            this.mascot.gentleNudge("hint_pattern_repeat");
          }
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 19: LEDOVÉ BLUDIŠTĚ (25 BLUDIŠŤ) ---
  function buildMazeMaps() {
    const base = [
      [[0, 0, 1, 0, 0], [1, 0, 1, 0, 1], [0, 0, 0, 0, 0], [0, 1, 1, 1, 0], [0, 0, 0, 1, 0]],
      [[0, 1, 0, 0, 0], [0, 1, 0, 1, 0], [0, 0, 0, 1, 0], [1, 1, 0, 0, 0], [0, 0, 0, 1, 0]],
      [[0, 0, 0, 1, 0], [1, 1, 0, 1, 0], [0, 0, 0, 0, 0], [0, 1, 1, 1, 0], [0, 0, 0, 0, 0]],
      [[0, 0, 0, 0, 0], [1, 1, 1, 1, 0], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1], [0, 0, 0, 0, 0]],
      [[0, 1, 0, 0, 0], [0, 0, 0, 1, 0], [1, 1, 0, 1, 0], [0, 0, 0, 0, 0], [0, 1, 1, 1, 0]],
      [[0, 0, 1, 0, 0], [0, 1, 1, 0, 1], [0, 0, 0, 0, 0], [1, 1, 0, 1, 0], [0, 0, 0, 1, 0]],
      [[0, 0, 0, 1, 0], [0, 1, 0, 0, 0], [0, 1, 1, 1, 0], [0, 0, 0, 1, 0], [1, 1, 0, 0, 0]],
      [[0, 1, 1, 0, 0], [0, 0, 0, 0, 1], [1, 1, 0, 1, 1], [0, 0, 0, 0, 0], [0, 1, 1, 1, 0]]
    ];
    const all = [...base];
    while (all.length < 25) {
      const src = base[all.length % base.length];
      // Transpozice pro rozmanitost při zachování průchodnosti z [0,0] do [4,4]
      const transposed = src[0].map((_, c) => src.map((r) => r[c]));
      all.push(transposed);
    }
    return all;
  }

  const MAZE_MAPS = buildMazeMaps();

  class IceMazeActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.deck = shuffleArray(MAZE_MAPS);
      this.mapIdx = 0;
      this.loadMaze(0);
    }

    loadMaze(idx) {
      this.mapIdx = idx % this.deck.length;
      if (this.mapIdx === 0 && idx > 0) {
        this.deck = shuffleArray(this.deck);
      }
      this.grid = this.deck[this.mapIdx];
      this.px = 0;
      this.py = 0;
      this.gx = 4;
      this.gy = 4;
      this.render();
      this.mascot.audio.speakCustom(
        "Ledové bludiště! Pomoz Pikovi najít cestu přes ledové kry až k rybičce!",
        "🧊 DOVEĎ TUČŇÁKA PIKA K RYBIČCE 🐟!"
      );
    }

    move(dx, dy) {
      const nx = this.px + dx;
      const ny = this.py + dy;
      if (ny < 0 || ny >= 5 || nx < 0 || nx >= 5) return;
      if (this.grid[ny][nx] === 1) {
        this.mascot.audio.playSfx("pop");
        this.mascot.audio.speakCustom("Tudy cesta nevede, je tam ledová kra!");
        return;
      }
      this.px = nx;
      this.py = ny;
      this.mascot.audio.playSfx("count");
      this.render();
      if (this.px === this.gx && this.py === this.gy) {
        this.mascot.celebrate("celebrate_06");
        this.onComplete();
        showContinueBanner(this.hostEl, {
          icon: "🧊",
          title: "PIKO DOŠEL BLUDIŠTĚM AŽ K RYBIČCE!",
          subtitle: "Skvělá orientace! Projdeme spolu další bludiště?",
          spokenText: "Hurá! Piko došel k rybičce! Pojďme na další bludiště!",
          nextLabel: "▶️ DALŠÍ BLUDIŠTĚ ➔",
          onNext: () => this.loadMaze(this.mapIdx + 1)
        });
      }
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🧊 LEDOVÉ BLUDIŠTĚ: DOVEĎ PIKA K RYBIČCE!</h2>
        </div>
        <div class="feed-layout">
          <div style="display:flex; align-items:center; justify-content:center; min-height:0;">
            <div class="grid-board" style="grid-template-columns:repeat(5, 1fr);">
              ${this.grid
                .map((row, y) =>
                  row
                    .map((cell, x) => {
                      const isPiko = x === this.px && y === this.py;
                      const isGoal = x === this.gx && y === this.gy;
                      const cls = cell === 1 ? "wall" : isGoal ? "goal" : isPiko ? "visited" : "";
                      const content = isPiko ? "🐧" : isGoal ? "🐟" : cell === 1 ? "🧊" : "";
                      return `<div class="grid-cell ${cls}" data-x="${x}" data-y="${y}">${content}</div>`;
                    })
                    .join("")
                )
                .join("")}
            </div>
          </div>
          <div class="bowl-panel" style="justify-content:center; gap:12px;">
            <div class="panel-heading">🎮 ŠIPKY PRO POHYB PIKA</div>
            <button class="btn-touch btn-primary" data-dir="0,-1" style="min-width:90px;">⬆️ NAHORU</button>
            <div style="display:flex; gap:14px;">
              <button class="btn-touch btn-primary" data-dir="-1,0" style="min-width:90px;">⬅️ VLEVO</button>
              <button class="btn-touch btn-primary" data-dir="1,0" style="min-width:90px;">➡️ VPRAVO</button>
            </div>
            <button class="btn-touch btn-primary" data-dir="0,1" style="min-width:90px;">⬇️ DOLŮ</button>
          </div>
        </div>
      `;

      this.hostEl.querySelectorAll("[data-dir]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const [dx, dy] = btn.dataset.dir.split(",").map(Number);
          this.move(dx, dy);
        });
      });

      this.hostEl.querySelectorAll(".grid-cell").forEach((cell) => {
        cell.addEventListener("click", () => {
          const tx = Number(cell.dataset.x);
          const ty = Number(cell.dataset.y);
          if (Math.abs(tx - this.px) + Math.abs(ty - this.py) === 1) {
            this.move(tx - this.px, ty - this.py);
          }
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 20: ZVUKOVÉ A VIZUÁLNÍ PEXESO (25 ZVUKOVÝCH KARET + 1★–5★) ---
  const SOUND_MEMORY_ITEMS = [
    { emoji: "🥁", label: "BUBÍNEK", freq: 180 },
    { emoji: "🎺", label: "TRUBKA", freq: 523 },
    { emoji: "🎸", label: "KYTARA", freq: 330 },
    { emoji: "🔔", label: "ZVONEČEK", freq: 880 },
    { emoji: "🎹", label: "KLAVÍR", freq: 440 },
    { emoji: "🎻", label: "HOUSLE", freq: 659 },
    { emoji: "🎷", label: "SAXOFON", freq: 293 },
    { emoji: "🪈", label: "FLÉTNA", freq: 784 },
    { emoji: "🪗", label: "HARMONIKA", freq: 392 },
    { emoji: "🪕", label: "BENDŽO", freq: 349 },
    { emoji: "🐶", label: "PEJSEK", freq: 240 },
    { emoji: "🐱", label: "KOČIČKA", freq: 620 },
    { emoji: "🐸", label: "ŽABIČKA", freq: 210 },
    { emoji: "🦉", label: "SOVIČKA", freq: 480 },
    { emoji: "🐝", label: "VČELIČKA", freq: 710 },
    { emoji: "🦁", label: "LEV", freq: 155 },
    { emoji: "🐘", label: "SLON", freq: 140 },
    { emoji: "🐬", label: "DELFÍN", freq: 920 },
    { emoji: "🚂", label: "VLÁČEK", freq: 260 },
    { emoji: "🚒", label: "HASIČI", freq: 580 },
    { emoji: "🚁", label: "VRTULNÍK", freq: 225 },
    { emoji: "🚀", label: "RAKETA", freq: 310 },
    { emoji: "⏰", label: "BUDÍK", freq: 840 },
    { emoji: "🐦", label: "PTÁČEK", freq: 960 },
    { emoji: "🐧", label: "TUČŇÁK", freq: 500 }
  ];

  class SoundMemoryActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.pool = shuffleArray(SOUND_MEMORY_ITEMS);
      this.cursor = 0;
      this.newGame();
    }

    playTone(freq) {
      const ctx = this.mascot.audio.ensureAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    }

    newGame() {
      const stars = this.level.stars || 1;
      const pairCount = stars === 1 ? 3 : stars === 2 ? 4 : stars === 3 ? 5 : stars === 4 ? 6 : 7;
      if (this.cursor + pairCount > this.pool.length) {
        this.pool = shuffleArray(SOUND_MEMORY_ITEMS);
        this.cursor = 0;
      }
      const items = this.pool.slice(this.cursor, this.cursor + pairCount);
      this.cursor += pairCount;
      this.deck = [];
      items.forEach((it, idx) => {
        this.deck.push({ id: idx * 2, ...it, open: false, matched: false });
        this.deck.push({ id: idx * 2 + 1, ...it, open: false, matched: false });
      });
      this.deck = shuffleArray(this.deck);
      this.opened = [];
      this.locked = false;
      this.render();
      this.mascot.audio.speakCustom(
        "Zvukové pexeso! Otáčej kartičky, poslouchej a najdi stejné dvojice!",
        "🥁 OTOČ KARTIČKY A NAJDI STEJNÉ DVOJICE!"
      );
    }

    render() {
      const matchedPairs = this.deck.filter((c) => c.matched).length / 2;
      const totalPairs = this.deck.length / 2;
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🥁 ZVUKOVÉ PEXESO: NAJDI STEJNÉ DVOJICE!</h2>
          <div class="workspace-actions">
            <span class="step-pill current">DVOJICE: ${matchedPairs} / ${totalPairs}</span>
          </div>
        </div>
        <div class="interactive-stage">
          <div class="cards-grid">
            ${this.deck
              .map((c) => {
                const show = c.open || c.matched;
                return `
                  <button class="game-card ${c.matched ? "matched" : c.open ? "selected" : ""}" data-id="${c.id}">
                    <span class="game-card-emoji">${show ? c.emoji : "❄️"}</span>
                    <span class="game-card-label">${show ? c.label : "OTOČIT"}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `;

      this.hostEl.querySelectorAll("[data-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (this.locked) return;
          const card = this.deck.find((c) => c.id === Number(btn.dataset.id));
          if (!card || card.open || card.matched) return;
          card.open = true;
          this.playTone(card.freq);
          this.mascot.audio.speakCustom(card.label, `🔊 ${card.emoji} ${card.label}`);
          this.opened.push(card);
          this.render();

          if (this.opened.length === 2) {
            const [a, b] = this.opened;
            if (a.emoji === b.emoji) {
              a.matched = true;
              b.matched = true;
              this.opened = [];
              this.mascot.audio.playSfx("snap");
              this.render();
              if (this.deck.every((x) => x.matched)) {
                this.mascot.celebrate("celebrate_02");
                this.onComplete();
                showContinueBanner(this.hostEl, {
                  icon: "🥁",
                  title: "VŠECHNY ZVUKOVÉ DVOJICE JSOU NALEZENY!",
                  subtitle: "Máš skvělou paměť i sluch! Zahrajeme si další pexeso?",
                  spokenText: "Výborně! Všechny dvojice jsou nalezeny! Pojďme na další pexeso!",
                  nextLabel: "▶️ DALŠÍ PEXESO ➔",
                  onNext: () => this.newGame()
                });
              }
            } else {
              this.locked = true;
              setTimeout(() => {
                a.open = false;
                b.open = false;
                this.opened = [];
                this.locked = false;
                this.render();
              }, 750);
            }
          }
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 21: KÓDOVÁNÍ CESTY (DYNAMICKÁ MŘÍŽKA DLE HVĚZDIČEK 3x3 AŽ 7x7 + TRACING + BFS) ---
  function checkBfsPath(size, start, goal, holes) {
    const holeSet = new Set(holes.map(([x, y]) => `${x},${y}`));
    if (holeSet.has(`${start[0]},${start[1]}`) || holeSet.has(`${goal[0]},${goal[1]}`)) return false;
    const q = [[start[0], start[1], 0]];
    const visited = new Set([`${start[0]},${start[1]}`]);
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    while (q.length) {
      const [cx, cy, dist] = q.shift();
      if (cx === goal[0] && cy === goal[1]) return dist;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        const key = `${nx},${ny}`;
        if (nx >= 0 && nx < size && ny >= 0 && ny < size && !holeSet.has(key) && !visited.has(key)) {
          visited.add(key);
          q.push([nx, ny, dist + 1]);
        }
      }
    }
    return false;
  }

  function generateCodingLevels(gridSize, holeCount, count = 25) {
    const levels = [];
    const corners = [
      [0, 0], [0, gridSize - 1], [gridSize - 1, 0], [gridSize - 1, gridSize - 1],
      [0, Math.floor(gridSize / 2)], [gridSize - 1, Math.floor(gridSize / 2)],
      [Math.floor(gridSize / 2), 0], [Math.floor(gridSize / 2), gridSize - 1]
    ];
    let attempts = 0;
    while (levels.length < count && attempts < 1500) {
      attempts++;
      const s = corners[Math.floor(Math.random() * corners.length)];
      let g = corners[Math.floor(Math.random() * corners.length)];
      if (s[0] === g[0] && s[1] === g[1]) continue;
      const manhattan = Math.abs(s[0] - g[0]) + Math.abs(s[1] - g[1]);
      if (manhattan < gridSize - 1) continue;

      const holes = [];
      const used = new Set([`${s[0]},${s[1]}`, `${g[0]},${g[1]}`]);
      for (let h = 0; h < holeCount; h++) {
        let hx = Math.floor(Math.random() * gridSize);
        let hy = Math.floor(Math.random() * gridSize);
        if (!used.has(`${hx},${hy}`)) {
          holes.push([hx, hy]);
          used.add(`${hx},${hy}`);
        }
      }
      const dist = checkBfsPath(gridSize, s, g, holes);
      if (dist && dist >= manhattan) {
        const key = `${s.join()}_${g.join()}_${holes.map(h => h.join()).sort().join(';')}`;
        if (!levels.some(l => l.key === key)) {
          levels.push({ start: s, goal: g, holes, gridSize, key });
        }
      }
    }
    if (levels.length === 0) {
      levels.push({ start: [0, 0], goal: [gridSize - 1, gridSize - 1], holes: [], gridSize });
    }
    return levels;
  }

  class CodingPathActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      const stars = Math.max(1, Math.min(5, this.level.stars || 1));
      this.gridSize = Math.max(3, Math.min(7, stars + 2)); // 1★=3, 2★=4, 3★=5, 4★=6, 5★=7
      const holeCount = Math.max(1, stars * 2 - 2); // 1, 2, 4, 6, 8
      this.deck = shuffleArray(generateCodingLevels(this.gridSize, holeCount, 25));
      this.mapIdx = 0;
      this.loadMap(0);
    }

    loadMap(idx) {
      this.mapIdx = idx % this.deck.length;
      if (this.mapIdx === 0 && idx > 0) {
        this.deck = shuffleArray(this.deck);
      }
      const m = this.deck[this.mapIdx];
      this.startPos = [...m.start];
      this.px = m.start[0];
      this.py = m.start[1];
      this.gx = m.goal[0];
      this.gy = m.goal[1];
      this.holes = m.holes;
      this.commands = [];
      this.activeStepIdx = -1;
      this.failedStepIdx = -1;
      this.trace = [];
      this.isRunning = false;
      this.render();
      this.mascot.audio.speakCustom(
        "Kódování cesty! Poskládej šipky pro Pika tak, aby se vyhnul dírám v ledu a došel až k diamantu!",
        "🧭 NAPROGRAMUJ ŠIPKAMI CESTU K DIAMANTU 💎!"
      );
    }

    runProgram() {
      if (this.isRunning || !this.commands.length) return;
      this.isRunning = true;
      this.px = this.startPos[0];
      this.py = this.startPos[1];
      this.activeStepIdx = -1;
      this.failedStepIdx = -1;
      this.trace = [{ x: this.px, y: this.py, stepNum: 0, icon: "🏁" }];
      this.render();

      let i = 0;
      const step = () => {
        if (i >= this.commands.length) {
          this.isRunning = false;
          if (this.px === this.gx && this.py === this.gy) {
            // Hotovo
          } else {
            this.mascot.audio.speakCustom("Piko zatím nedošel k diamantu. Přidej další šipky!");
          }
          this.render();
          return;
        }

        this.activeStepIdx = i;
        const cmd = this.commands[i];
        const nx = this.px + cmd.dx;
        const ny = this.py + cmd.dy;

        // Kontrola okraje
        if (nx < 0 || nx >= this.gridSize || ny < 0 || ny >= this.gridSize) {
          this.failedStepIdx = i;
          this.isRunning = false;
          this.mascot.audio.playSfx("gentle_nudge");
          this.mascot.audio.speakCustom("Pozor, tam je okraj ledu! Zkus upravit šipky.");
          this.render();
          return;
        }

        // Kontrola díry
        if (this.holes.some(([hx, hy]) => hx === nx && hy === ny)) {
          this.failedStepIdx = i;
          this.isRunning = false;
          this.px = nx;
          this.py = ny;
          this.trace.push({ x: nx, y: ny, stepNum: i + 1, icon: "🕳️", crash: true });
          this.mascot.audio.playSfx("gentle_nudge");
          this.mascot.audio.speakCustom("Jejda, díra v ledu! Uprav kroky a zkus to znovu.");
          this.render();
          return;
        }

        // Bezpečný krok
        this.px = nx;
        this.py = ny;
        this.trace.push({ x: nx, y: ny, stepNum: i + 1, icon: cmd.icon });
        this.mascot.audio.playSfx("count");
        i++;
        this.render();

        if (this.px === this.gx && this.py === this.gy) {
          this.isRunning = false;
          this.activeStepIdx = -1;
          this.mascot.celebrate("celebrate_06");
          this.onComplete();
          showContinueBanner(this.hostEl, {
            icon: "💎",
            title: "PROGRAM FUNGUJE! PIKO ZÍSKAL DIAMANT!",
            subtitle: "Skvělé programování! Naprogramujeme další trasu?",
            spokenText: "Výborně! Piko došel k pokladu! Pojďme naprogramovat další trasu!",
            nextLabel: "▶️ DALŠÍ TRASA ➔",
            onNext: () => this.loadMap(this.mapIdx + 1)
          });
          return;
        }

        setTimeout(step, 400);
      };

      setTimeout(step, 250);
    }

    render() {
      const isRunning = this.isRunning;
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🧭 KÓDOVÁNÍ CESTY: SESTAV KROKY K POKLADU 💎 (${this.gridSize}×${this.gridSize})</h2>
          <div class="workspace-actions">
            <button id="btn-code-undo" class="btn-touch btn-secondary" ${isRunning || !this.commands.length ? "disabled" : ""}>⌫ KROK ZPĚT</button>
            <button id="btn-code-clear" class="btn-touch btn-secondary" ${isRunning ? "disabled" : ""}>🧹 VYMAZAT VŠE</button>
          </div>
        </div>
        <div class="feed-layout">
          <div style="display:flex; align-items:center; justify-content:center; min-height:0; width:100%; flex:1;">
            <div class="grid-board" style="grid-template-columns:repeat(${this.gridSize}, 1fr); max-width:min(68dvh, 480px); width:100%;">
              ${Array.from({ length: this.gridSize * this.gridSize })
                .map((_, idx) => {
                  const x = idx % this.gridSize;
                  const y = Math.floor(idx / this.gridSize);
                  const isPiko = x === this.px && y === this.py;
                  const isGoal = x === this.gx && y === this.gy;
                  const isHole = this.holes.some(([hx, hy]) => hx === x && hy === y);
                  const tr = this.trace.filter((t) => t.x === x && t.y === y);
                  const hasTrace = tr.length > 0;
                  const lastTr = hasTrace ? tr[tr.length - 1] : null;
                  const isCrash = lastTr && lastTr.crash;
                  return `
                    <div class="grid-cell ${isGoal ? "goal" : isHole ? "wall" : ""} ${hasTrace ? "trace-visited" : ""} ${isCrash ? "trace-crash" : ""}">
                      ${hasTrace && lastTr.stepNum > 0 ? `<span class="trace-step-badge">${lastTr.stepNum}${lastTr.icon}</span>` : ""}
                      ${isPiko ? "🐧" : isGoal ? "💎" : isHole ? "🕳️" : ""}
                    </div>
                  `;
                })
                .join("")}
            </div>
          </div>
          <div class="bowl-panel" style="justify-content:space-between; flex:1;">
            <div class="panel-heading">1. VYBER ŠIPKY DO PROGRAMU:</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
              <button class="btn-touch btn-secondary" data-cmd="0,-1,⬆️,Nahoru" ${isRunning ? "disabled" : ""}>⬆️ NAHORU</button>
              <button class="btn-touch btn-secondary" data-cmd="0,1,⬇️,Dolů" ${isRunning ? "disabled" : ""}>⬇️ DOLŮ</button>
              <button class="btn-touch btn-secondary" data-cmd="-1,0,⬅️,Vlevo" ${isRunning ? "disabled" : ""}>⬅️ VLEVO</button>
              <button class="btn-touch btn-secondary" data-cmd="1,0,➡️,Vpravo" ${isRunning ? "disabled" : ""}>➡️ VPRAVO</button>
            </div>
            <div class="panel-heading" style="margin-top:6px;">2. KROKY PROGRAMU (${this.commands.length}):</div>
            <div class="bowl-dropzone code-steps-list" style="min-height:58px; max-height:120px; overflow-y:auto;">
              ${
                this.commands.length
                  ? this.commands
                      .map((c, i) => {
                        const statusClass =
                          i === this.activeStepIdx ? "active" : i === this.failedStepIdx ? "error" : i < this.activeStepIdx ? "done" : "";
                        return `<button class="code-step-chip ${statusClass}" data-remove-step="${i}" title="Klikni pro smazání kroku" ${isRunning ? "disabled" : ""}>#${i + 1} ${c.icon}</button>`;
                      })
                      .join("")
                  : '<span style="color:var(--navy-soft); font-weight:700;">ZATÍM ŽÁDNÉ KROKY. PŘIDEJ ŠIPKY VÝŠE.</span>'
              }
            </div>
            <button id="btn-code-run" class="btn-touch btn-feed-submit" ${isRunning || !this.commands.length ? "disabled" : ""}>
              ${isRunning ? "⏳ PROGRAM BĚŽÍ..." : "▶ SPUSTIT KÓD"}
            </button>
          </div>
        </div>
      `;

      document.getElementById("btn-code-undo").addEventListener("click", () => {
        if (this.isRunning || !this.commands.length) return;
        this.commands.pop();
        this.px = this.startPos[0];
        this.py = this.startPos[1];
        this.trace = [];
        this.activeStepIdx = -1;
        this.failedStepIdx = -1;
        this.mascot.audio.playSfx("pop");
        this.render();
      });

      document.getElementById("btn-code-clear").addEventListener("click", () => {
        if (this.isRunning) return;
        this.loadMap(this.mapIdx);
      });

      document.getElementById("btn-code-run").addEventListener("click", () => {
        if (this.isRunning) return;
        this.runProgram();
      });

      this.hostEl.querySelectorAll("[data-cmd]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (this.isRunning) return;
          const [dx, dy, icon, spoken] = btn.dataset.cmd.split(",");
          this.commands.push({ dx: Number(dx), dy: Number(dy), icon, spoken });
          this.mascot.audio.playSfx("pop");
          this.mascot.audio.speakCustom(spoken);
          this.render();
        });
      });

      this.hostEl.querySelectorAll("[data-remove-step]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (this.isRunning) return;
          const idx = Number(btn.dataset.removeStep);
          this.commands.splice(idx, 1);
          this.px = this.startPos[0];
          this.py = this.startPos[1];
          this.trace = [];
          this.activeStepIdx = -1;
          this.failedStepIdx = -1;
          this.mascot.audio.playSfx("pop");
          this.render();
        });
      });
    }

    destroy() {
      this.isRunning = false;
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 22: TŘÍDĚNÍ PODLE VÍCE VLASTNOSTÍ (MATICE - 24 KOMBINACÍ + NA PŘESKÁČKU) ---
  const MATRIX_ROW_POOL = [
    { id: "fish", label: "🐟 RYBKA", emoji: "🐟" },
    { id: "star", label: "⭐ HVĚZDA", emoji: "⭐" },
    { id: "car", label: "🚗 AUTO", emoji: "🚗" },
    { id: "balloon", label: "🎈 BALÓNEK", emoji: "🎈" },
    { id: "flower", label: "🌸 KYTIČKA", emoji: "🌸" },
    { id: "apple", label: "🍎 JABLÍČKO", emoji: "🍎" },
    { id: "boat", label: "⛵ LOĎKA", emoji: "⛵" },
    { id: "crown", label: "👑 KORUNA", emoji: "👑" },
    { id: "butterfly", label: "🦋 MOTÝLEK", emoji: "🦋" },
    { id: "rocket", label: "🚀 RAKETA", emoji: "🚀" },
    { id: "house", label: "🏠 DOMEČEK", emoji: "🏠" },
    { id: "umbrella", label: "☂️ DEŠTNÍK", emoji: "☂️" },
    { id: "heart", label: "❤️ SRDÍČKO", emoji: "❤️" },
    { id: "tree", label: "🌲 STROMEK", emoji: "🌲" },
    { id: "bell", label: "🔔 ZVONEK", emoji: "🔔" },
    { id: "hat", label: "🎩 KLOBOUK", emoji: "🎩" },
    { id: "cupcake", label: "🧁 DORTÍK", emoji: "🧁" },
    { id: "guitar", label: "🎸 KYTARA", emoji: "🎸" },
    { id: "train", label: "🚂 VLÁČEK", emoji: "🚂" },
    { id: "duck", label: "🦆 KACHNIČKA", emoji: "🦆" },
    { id: "frog", label: "🐸 ŽABIČKA", emoji: "🐸" },
    { id: "owl", label: "🦉 SOVIČKA", emoji: "🦉" },
    { id: "mushroom", label: "🍄 HŘÍBEK", emoji: "🍄" },
    { id: "kite", label: "🪁 DRAK", emoji: "🪁" }
  ];

  const MATRIX_COL_POOL = [
    { id: "red", label: "🔴 ČERVENÁ", bg: "#FFE5EC" },
    { id: "blue", label: "🔵 MODRÁ", bg: "#E2F0FF" },
    { id: "yellow", label: "🟡 ŽLUTÁ", bg: "#FFF9DB" },
    { id: "green", label: "🟢 ZELENÁ", bg: "#E6FCF5" },
    { id: "purple", label: "🟣 FIALOVÁ", bg: "#F3E8FF" },
    { id: "orange", label: "🟠 ORANŽOVÁ", bg: "#FFEDD5" }
  ];

  class MatrixSortActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.loadNextSet();
    }

    loadNextSet() {
      const stars = this.level.stars || 1;
      const rCount = stars >= 5 ? 3 : 2;
      const cCount = stars >= 3 ? 3 : 2;
      this.rows = shuffleArray(MATRIX_ROW_POOL).slice(0, rCount);
      this.cols = shuffleArray(MATRIX_COL_POOL).slice(0, cCount);
      this.filled = {};
      this.items = [];
      this.rows.forEach((r) => {
        this.cols.forEach((c) => {
          this.items.push({
            key: `${r.id}_${c.id}`,
            emoji: r.emoji,
            bg: c.bg,
            label: `${c.label.split(" ")[1]} ${r.label.split(" ")[1]}`
          });
        });
      });
      this.items = shuffleArray(this.items);
      this.render();
      this.mascot.audio.speakCustom(
        "Třídění v tabulce! Přetáhni prstem kartičku do správného řádku a sloupce. Můžeš je dávat v libovolném pořadí!",
        "🗂️ PŘETÁHNI KARTIČKY DO TABULKY (LZE I NA PŘESKÁČKU)!"
      );
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🗂️ ZAŘAĎ KARTIČKY DO TABULKY (PŘETÁHNI PRSTEM I NA PŘESKÁČKU)!</h2>
          <div class="workspace-actions">
            <span class="step-pill current">ZAŘAZENO: ${Object.keys(this.filled).length} / ${this.items.length}</span>
          </div>
        </div>
        <div class="feed-layout">
          <div style="display:flex; align-items:center; justify-content:center;">
            <table class="matrix-table">
              <thead>
                <tr>
                  <th>TVAR \\ BARVA</th>
                  ${this.cols.map((c) => `<th>${c.label}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                ${this.rows
                  .map(
                    (r) => `
                  <tr>
                    <th>${r.label}</th>
                    ${this.cols
                      .map((c) => {
                        const key = `${r.id}_${c.id}`;
                        const done = this.filled[key];
                        return `<td class="matrix-cell ${done ? "filled" : ""}" data-cell="${key}" style="background:${done ? c.bg : "#f8fcff"};">${done ? r.emoji : "❓"}</td>`;
                      })
                      .join("")}
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
          <div class="bowl-panel" style="justify-content:center;">
            <div class="panel-heading">ŤUKNI PRO POSLECH NEBO PŘETÁHNI DO TABULKY:</div>
            <div class="cards-grid">
              ${this.items
                .map((it) => {
                  const done = this.filled[it.key];
                  return `
                    <button class="game-card ${done ? "matched" : ""}" data-item="${it.key}" style="background:${it.bg}; cursor:${done ? "default" : "grab"}; touch-action:none;" ${done ? "disabled" : ""}>
                      <span class="game-card-emoji">${it.emoji}</span>
                      <span class="game-card-label">${it.label}</span>
                    </button>
                  `;
                })
                .join("")}
            </div>
          </div>
        </div>
      `;

      this.hostEl.querySelectorAll("[data-item]").forEach((btn) => {
        const itemKey = btn.dataset.item;
        const it = this.items.find((x) => x.key === itemKey);
        if (!it) return;

        bindPointerDragDrop(btn, {
          dragClass: "dragging-active",
          onDragStart: () => {
            this.mascot.audio.playSfx("pop");
          },
          onDrop: (dropTarget) => {
            const cell = dropTarget ? dropTarget.closest(".matrix-cell") : null;
            if (!cell) {
              this.mascot.audio.playSfx("gentle_nudge");
              return false;
            }
            const cellKey = cell.dataset.cell;
            if (this.filled[cellKey]) return false;
            if (cellKey === it.key) {
              this.filled[cellKey] = true;
              this.mascot.audio.playSfx("snap");
              this.render();
              if (Object.keys(this.filled).length === this.items.length) {
                this.mascot.celebrate("celebrate_02");
                this.onComplete();
                showContinueBanner(this.hostEl, {
                  icon: "🗂️",
                  title: "CELÁ TABULKA JE SPRÁVNĚ VYPLNĚNÁ!",
                  subtitle: "Všechny tvary a barvy sedí! Vyplníme další tabulku?",
                  spokenText: "Výborně! Celá tabulka je správně vyplněná! Pojďme na další tabulku!",
                  nextLabel: "▶️ DALŠÍ TABULKA ➔",
                  onNext: () => this.loadNextSet()
                });
              }
              return true;
            } else {
              cell.classList.add("gentle-nudge-anim");
              setTimeout(() => cell.classList.remove("gentle-nudge-anim"), 500);
              this.mascot.audio.playSfx("gentle_nudge");
              this.mascot.gentleNudge("hint_shape_size");
              return false;
            }
          }
        });

        // Samostatný klik pro hlasové přečtení názvu kartičky (žádné automatické vložení)
        btn.addEventListener("click", () => {
          if (this.filled[itemKey]) return;
          this.mascot.audio.playSfx("pop");
          this.mascot.audio.speakCustom(it.label);
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  /* =========================================================================
   * 9. RODIČOVSKÁ ZÓNA & ČASOVÝ LIMIT (BEDTIME REŽIM)
   * ========================================================================= */
  class ParentalController {
    constructor(catalog, store, mascot, audio) {
      this.catalog = catalog;
      this.store = store;
      this.mascot = mascot;
      this.audio = audio;

      this.holdBtn = document.getElementById("btn-parent-gate");
      this.holdRing = document.getElementById("parent-hold-ring");
      this.gateModal = document.getElementById("modal-parent-gate");
      this.pzModal = document.getElementById("modal-parent-zone");
      this.bedtimeOverlay = document.getElementById("bedtime-overlay");

      this.holdTimer = null;
      this.holdProgressRaf = null;
      this.gateAnswer = 21;
      this.gateTyped = "";
      this.remainingSec = (this.store.state.settings.limitMinutes || 0) * 60;

      this.bindParentHold();
      this.bindMathGate();
      this.bindParentDashboard();
      this.startSessionTimer();
    }

    bindParentHold() {
      const HOLD_MS = 3000;
      const CIRCUMFERENCE = 176;
      let startAt = 0;

      const cancelHold = () => {
        clearTimeout(this.holdTimer);
        cancelAnimationFrame(this.holdProgressRaf);
        this.holdBtn.classList.remove("holding");
        this.holdRing.style.strokeDashoffset = String(CIRCUMFERENCE);
      };

      const startHold = (e) => {
        e.preventDefault();
        startAt = performance.now();
        this.holdBtn.classList.add("holding");

        const animateRing = (now) => {
          const pct = Math.min(1, (now - startAt) / HOLD_MS);
          this.holdRing.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - pct));
          if (pct < 1) {
            this.holdProgressRaf = requestAnimationFrame(animateRing);
          }
        };
        this.holdProgressRaf = requestAnimationFrame(animateRing);

        this.holdTimer = setTimeout(() => {
          cancelHold();
          this.openMathGate();
        }, HOLD_MS);
      };

      this.holdBtn.addEventListener("pointerdown", startHold);
      this.holdBtn.addEventListener("pointerup", cancelHold);
      this.holdBtn.addEventListener("pointerleave", cancelHold);
      this.holdBtn.addEventListener("pointercancel", cancelHold);
    }

    openMathGate(isBedtimeUnlock = false) {
      this.isBedtimeUnlock = isBedtimeUnlock;
      const a = 11 + Math.floor(Math.random() * 8);
      const b = 4 + Math.floor(Math.random() * 6);
      this.gateAnswer = a + b;
      this.gateTyped = "";
      document.getElementById("gate-question").textContent = `${a} + ${b} = ?`;
      document.getElementById("gate-answer-display").textContent = "_";
      document.getElementById("gate-error-msg").classList.add("hidden");
      this.gateModal.classList.remove("hidden");
    }

    bindMathGate() {
      this.gateModal.querySelectorAll(".numpad-key").forEach((key) => {
        key.addEventListener("click", () => {
          const digit = key.dataset.digit;
          const action = key.dataset.action;
          if (digit !== undefined && this.gateTyped.length < 3) {
            this.gateTyped += digit;
          } else if (action === "clear") {
            this.gateTyped = this.gateTyped.slice(0, -1);
          } else if (action === "submit") {
            if (Number(this.gateTyped) === this.gateAnswer) {
              this.gateModal.classList.add("hidden");
              this.openDashboard();
              if (this.isBedtimeUnlock) {
                this.pzModal.querySelectorAll(".pz-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "screentime"));
                this.pzModal.querySelectorAll(".pz-tab-panel").forEach((p) => p.classList.toggle("active", p.id === "pz-tab-screentime"));
              }
            } else {
              document.getElementById("gate-error-msg").classList.remove("hidden");
              this.gateTyped = "";
            }
          }
          document.getElementById("gate-answer-display").textContent = this.gateTyped || "_";
        });
      });

      document.getElementById("btn-gate-cancel").addEventListener("click", () => {
        this.gateModal.classList.add("hidden");
      });
    }

    openDashboard() {
      this.renderProgressTab();
      this.renderGalleryTab();
      this.syncAudioSliders();
      this.syncLimitButtons();
      this.pzModal.classList.remove("hidden");
    }

    bindParentDashboard() {
      document.getElementById("btn-pz-close").addEventListener("click", () => {
        this.pzModal.classList.add("hidden");
      });

      this.pzModal.querySelectorAll(".pz-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          this.pzModal.querySelectorAll(".pz-tab").forEach((t) => t.classList.remove("active"));
          this.pzModal.querySelectorAll(".pz-tab-panel").forEach((p) => p.classList.remove("active"));
          tab.classList.add("active");
          document.getElementById("pz-tab-" + tab.dataset.tab).classList.add("active");
        });
      });

      // Časové limity
      this.pzModal.querySelectorAll(".btn-limit").forEach((btn) => {
        btn.addEventListener("click", () => {
          const mins = Number(btn.dataset.minutes);
          this.store.state.settings.limitMinutes = mins;
          this.store.save();
          this.remainingSec = mins * 60;
          this.syncLimitButtons();
          this.updateTimerBadge();
        });
      });

      document.getElementById("btn-trigger-bedtime").addEventListener("click", () => {
        this.pzModal.classList.add("hidden");
        this.triggerBedtimeMode();
      });

      // Odemčení spánku přes matematický zámek (rodičovský přístup)
      document.getElementById("btn-bedtime-parent-unlock").addEventListener("click", () => {
        this.openMathGate(true);
      });

      // Tlačítko pro restart časovače v záložce Screentime
      const btnRestartTimer = document.getElementById("btn-pz-restart-timer");
      if (btnRestartTimer) {
        btnRestartTimer.addEventListener("click", () => {
          this.remainingSec = (this.store.state.settings.limitMinutes || 30) * 60;
          this.bedtimeOverlay.classList.add("hidden");
          this.pzModal.classList.add("hidden");
          this.mascot.setState("IDLE");
          this.updateTimerBadge();
          this.audio.speak("intro_welcome");
        });
      }

      // Hlasitost
      const bindSlider = (id, key, valId) => {
        const input = document.getElementById(id);
        input.addEventListener("input", () => {
          const pct = Number(input.value);
          this.store.state.settings[key] = pct / 100;
          document.getElementById(valId).textContent = `${pct} %`;
          this.store.save();
        });
      };
      bindSlider("vol-voice", "voiceVol", "vol-voice-val");
      bindSlider("vol-sfx", "sfxVol", "vol-sfx-val");
      bindSlider("vol-music", "musicVol", "vol-music-val");
    }

    syncLimitButtons() {
      const current = this.store.state.settings.limitMinutes;
      this.pzModal.querySelectorAll(".btn-limit").forEach((btn) => {
        btn.classList.toggle("active", Number(btn.dataset.minutes) === current);
      });
    }

    syncAudioSliders() {
      const s = this.store.state.settings;
      const set = (id, valId, val) => {
        const pct = Math.round(val * 100);
        document.getElementById(id).value = String(pct);
        document.getElementById(valId).textContent = `${pct} %`;
      };
      set("vol-voice", "vol-voice-val", s.voiceVol);
      set("vol-sfx", "vol-sfx-val", s.sfxVol);
      set("vol-music", "vol-music-val", s.musicVol);
    }

    renderProgressTab() {
      const list = document.getElementById("pz-progress-list");
      const maxTime = Math.max(180, ...Object.values(this.store.state.zoneActivityTimeSec));

      list.innerHTML = this.catalog.zones
        .map((z) => {
          const sec = this.store.state.zoneActivityTimeSec[z.id] || 0;
          const mins = Math.max(1, Math.round(sec / 60));
          const pct = Math.min(100, Math.round((sec / maxTime) * 100));
          const zoneActs = this.catalog.activities.filter((a) => a.zoneId === z.id);
          const stars = zoneActs.reduce((acc, a) => acc + (this.store.state.starsEarned[a.id] || 0), 0);
          return `
            <div class="progress-row">
              <div class="progress-row-head">
                <span>${z.icon} ${z.title}</span>
                <span>⭐ ${stars} / ${zoneActs.length * 5} • cca ${mins} min hraní</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width:${pct}%; background:${z.accentColor};"></div>
              </div>
            </div>
          `;
        })
        .join("");
    }

    renderGalleryTab() {
      const grid = document.getElementById("pz-gallery-grid");
      const items = this.store.state.gallery;
      if (!items.length) {
        grid.innerHTML = `<p style="font-weight:700; color:var(--navy-soft);">Zatím nejsou uložené žádné obrázky. Dokončete kresbu v Uměleckém ateliéru (Zóna A) a klikněte na „Uložit obrázek“.</p>`;
        return;
      }
      grid.innerHTML = items
        .map(
          (art) => `
          <div class="gallery-item">
            <img src="${art.dataUrl}" alt="${art.title}" />
            <div style="font-weight:900; font-size:0.9rem;">${art.title}</div>
            <div style="font-size:0.75rem; color:var(--navy-soft);">${art.createdAt}</div>
            <div style="display:flex; gap:8px;">
              <a class="btn-touch btn-primary" style="flex:1; text-decoration:none; font-size:0.85rem;" href="${art.dataUrl}" download="${art.id}.png">⬇️ ULOŽIT</a>
              <button class="btn-touch btn-secondary btn-del-art" data-art-id="${art.id}" style="min-width:64px;">🗑️</button>
            </div>
          </div>
        `
        )
        .join("");

      grid.querySelectorAll(".btn-del-art").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.store.deleteArtwork(btn.dataset.artId);
          this.renderGalleryTab();
        });
      });
    }

    startSessionTimer() {
      this.updateTimerBadge();
      setInterval(() => {
        if (this.store.state.settings.limitMinutes === 0) return;
        if (!this.bedtimeOverlay.classList.contains("hidden")) return;
        if (this.remainingSec > 0) {
          this.remainingSec -= 1;
          this.updateTimerBadge();
          if (this.remainingSec === 0) {
            this.triggerBedtimeMode();
          }
        }
      }, 1000);
    }

    updateTimerBadge() {
      const textEl = document.getElementById("session-timer-text");
      if (this.store.state.settings.limitMinutes === 0) {
        textEl.textContent = "∞";
        return;
      }
      const m = Math.floor(this.remainingSec / 60);
      const s = this.remainingSec % 60;
      textEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    triggerBedtimeMode() {
      this.mascot.clearInactivityTimer();
      this.mascot.setState("SLEEPY");
      this.bedtimeOverlay.classList.remove("hidden");
      this.audio.speak("bedtime_goodnight", null, {
        stateDuringSpeech: "SLEEPY",
        stateAfterSpeech: "SLEEPY"
      });
    }
  }

  /* =========================================================================
   * 10. HLAVNÍ APLIKAČNÍ KONTROLER (MAPA OSTROVŮ A NAVIGACE)
   * ========================================================================= */
  const ACTIVITY_CHILD_GOALS = {
    act_01: {
      visual: "✏️ ➔ 🐧🎨",
      goalText: "Naučíš se nakreslit obrázek krok za krokem",
      spoken: "Krok za krokem! Tady se naučíš nakreslit krásný obrázek podle jednoduchých čar a nakonec si ho vybarvíš!"
    },
    act_02: {
      visual: "🔴 + 🟡 ➔ 🟠",
      goalText: "Smíchej dvě barvy a vykouzli novou barvu",
      spoken: "Míchání barev! Tady zjistíš, jaká nová barva vznikne, když v kotlíku smícháš dvě barvičky dohromady!"
    },
    act_03: {
      visual: "🦋 🪞 🦋",
      goalText: "Dokresli druhou polovinu obrázku jako v zrcadle",
      spoken: "Zrcadlové kreslení! Dokresli druhou polovinu obrázku, aby obě strany vypadaly stejně jako v zrcadle!"
    },
    act_04: {
      visual: "✍️ ➔ 📝",
      goalText: "Nauč se správně psát písmenka a celá slova do linek",
      spoken: "Škola psaní! Nauč se správně psát tiskací i psací písmenka a celá slova. Začni na zelené tečce a veď čáru podle šipek!"
    },
    act_05: {
      visual: "1️⃣ • 2️⃣ • 3️⃣ ➔ ⭐",
      goalText: "Spoj hvězdičky čarou a odhal tajné souhvězdí",
      spoken: "Spojovačka souhvězdí! Spoj hvězdičky na obloze čarou, aby se ti ukázal schovaný obrázek!"
    },
    act_06: {
      visual: "🔺🔷 ➔ 🐟",
      goalText: "Poskládej z barevných tvarů celé zvířátko",
      spoken: "Tangram! Poskládej barevné trojúhelníky a čtverce do obrysu, abys postavil celé zvířátko nebo věc!"
    },
    act_07: {
      visual: "🐧 ➔ 👤",
      goalText: "Najdi každému obrázku jeho správný černý stín",
      spoken: "Stínové divadlo! Pozorně se dívej na tvary a přiřaď každý barevný obrázek k jeho správnému stínu!"
    },
    act_08: {
      visual: "🔍 👀 ❓",
      goalText: "Najdi obrázek, který se liší od ostatních",
      spoken: "Zrakový detektiv! Trénuj bystré oči a najdi mezi obrázky ten, který je jiný nebo do řady nepatří!"
    },
    act_09: {
      visual: "🧩 ➔ 🖼️",
      goalText: "Slož rozbitou ledovou fotografii z dílků",
      spoken: "Polární skládačka! Doplň chybějící dílky na správná místa, aby byl celý obrázek zase pohromadě!"
    },
    act_10: {
      visual: "👂 🅰️ ➔ 🍎",
      goalText: "Poslechni si hlásku a vyber obrázek na stejné písmeno",
      spoken: "První hláska! Poslechni si, na jaké písmenko slovo začíná, a vyber správný obrázek!"
    },
    act_11: {
      visual: "👏 TA • RI • ❄️",
      goalText: "Vytleskej slovo na slabiky po ledových krách",
      spoken: "Vytleskávání slabik! Rozděl slovo na slabiky a poklepáním rozsviť tolik ledových ker, kolik má slovo částí!"
    },
    act_12: {
      visual: "🛷 ➔ 🅰️",
      goalText: "Objeď prstem tvar písmene nebo číslice ve sněhu",
      spoken: "Písmenková dráha! Naučíš se psát písmenka a čísla tak, že vybereš všechny sněhové vločky po dráze!"
    },
    act_13: {
      visual: "🐱 🎵 ☕",
      goalText: "Najdi dvě slova, která na konci znějí stejně (rýmují se)",
      spoken: "Rýmovací pexeso! Klikej na kartičky, poslouchej slova a najdi dvě, která se spolu hezky rýmují!"
    },
    act_14: {
      visual: "🐟 1, 2, 3 ➔ 🐧",
      goalText: "Napočítej přesný počet rybiček do bříška tučňáka",
      spoken: "Nakrm tučňáka! Naučíš se počítat tak, že dáš tučňákovi přesně tolik rybiček, kolik má napsáno na bříšku!"
    },
    act_15: {
      visual: "⚖️ 🧊 = 🧊",
      goalText: "Vyrovnej misky vah stejným počtem kostek ledu",
      spoken: "Ledové váhy! Přidávej nebo ubírej ledové kostky tak, aby bylo na obou stranách vah úplně stejně!"
    },
    act_16: {
      visual: "🐧➕🐧 ➔ 🔢",
      goalText: "Spočítej zvířátka v příběhu a vyber správné číslo",
      spoken: "Obrázkové počítání! Poslechni si příběh, spočítej všechna zvířátka na ledovci a klikni na správné číslo!"
    },
    act_17: {
      visual: "🐭 ➔ 🐕 ➔ 🐘",
      goalText: "Seřaď předměty postupně od nejmenšího po největší",
      spoken: "Od nejmenšího k největšímu! Porovnej velikosti a poskládej věci do řady podle toho, jak jsou velké!"
    },
    act_18: {
      visual: "🔴🔵🔴 ➔ ❓",
      goalText: "Odhal pravidlo v řadě a doplň, co patří na konec",
      spoken: "Logické řady! Podívej se, jak se obrázky střídají, a uhodni, který obrázek má pokračovat dál!"
    },
    act_19: {
      visual: "🐧 🧭 ➔ 🏠",
      goalText: "Proveď tučňáka bludištěm bezpečně až do cíle",
      spoken: "Ledové bludiště! Najdi volnou cestu mezi ledovými stěnami a doveď tučňáka až k iglú a rybičce!"
    },
    act_20: {
      visual: "🔔👂 ➔ 🔔",
      goalText: "Zapamatuj si tóny zvonkohry a zahraj je ve stejném pořadí",
      spoken: "Zvukové pexeso! Trénuj ouška i paměť, poslechni si rampouchy a pak na ně cinkni úplně stejně!"
    },
    act_21: {
      visual: "⬆️➡️⬆️ ➔ 🐟",
      goalText: "Naprogramuj šipkami cestu pro tučňáka k rybičce",
      spoken: "Kódování cesty! Poskládej dopředu šipky, kudy má tučňák jít, a vyhni se přitom dírám v ledu!"
    },
    act_22: {
      visual: "🔴➕⭐ ➔ 🎯",
      goalText: "Zařaď každou kartičku do tabulky podle tvaru i barvy",
      spoken: "Třídění podle dvou pravidel! Najdi v tabulce správné políčko, kde sedí zároveň barva i tvar!"
    }
  };

  class PenguinWorldApp {
    constructor(catalog, manifest) {
      this.catalog = catalog;
      this.store = new ProgressStore();
      this.audio = new AudioKaraokeEngine(manifest, this.store);
      this.mascot = new PenguinMascot(this.audio);
      this.parental = new ParentalController(catalog, this.store, this.mascot, this.audio);

      this.currentActivity = null;
      this.currentLevelStars = 1;
      this.activeEngine = null;

      this.viewMap = document.getElementById("view-map");
      this.viewActivity = document.getElementById("view-activity");
      this.workspaceEl = document.getElementById("activity-workspace");
      this.zoneDrawer = document.getElementById("zone-drawer");
      this.btnHome = document.getElementById("btn-home");
      this.brandBadge = document.getElementById("brand-badge");
      this.levelStarsBar = document.getElementById("level-stars-bar");

      this.renderIslands();
      this.bindNavigation();

      // Odložení uvítací repliky na první interakci nebo okamžité zobrazení titulků
      this.audio.renderKaraokeWords(
        "AHOJ KAMARÁDE! JÁ JSEM TUČŇÁK PIKO. VYBER SI OSTROV A POJĎ SI HRÁT!"
      );
      document.addEventListener(
        "pointerdown",
        () => {
          this.audio.ensureAudioCtx();
          this.audio.startAmbientMusic();
        },
        { once: true }
      );
    }

    renderIslands() {
      const layer = document.getElementById("islands-layer");
      layer.innerHTML = this.catalog.zones
        .map((zone) => {
          const count = this.catalog.activities.filter((a) => a.zoneId === zone.id).length;
          return `
            <button
              class="island-card"
              data-zone-id="${zone.id}"
              style="left:${zone.position.x}%; top:${zone.position.y}%; background:${zone.themeColor};"
              aria-label="${zone.title}"
            >
              <span class="island-icon">${zone.icon}</span>
              <span class="island-title">${zone.title}</span>
              <span class="island-meta" style="background:${zone.accentColor};">${count} AKTIVIT</span>
            </button>
          `;
        })
        .join("");

      layer.querySelectorAll(".island-card").forEach((card) => {
        card.addEventListener("click", () => {
          this.openZoneDrawer(card.dataset.zoneId);
        });
      });
    }

    openZoneDrawer(zoneId) {
      const zone = this.catalog.zones.find((z) => z.id === zoneId);
      if (!zone) return;

      this.audio.playSfx("pop");
      this.audio.speak(zone.audioIntroId);

      document.getElementById("drawer-zone-icon").textContent = zone.icon;
      document.getElementById("drawer-zone-title").textContent = zone.title;
      document.getElementById("drawer-zone-subtitle").textContent = zone.subtitle;

      const listEl = document.getElementById("drawer-activities-list");
      const acts = this.catalog.activities.filter((a) => a.zoneId === zoneId);

      listEl.innerHTML = acts
        .map((act) => {
          const earned = this.store.state.starsEarned[act.id] || 0;
          const starBadge = earned ? "⭐".repeat(earned) : "⭐";
          return `
            <div class="activity-card-row ${act.implementedInPrototype ? "playable" : ""}">
              <div class="activity-row-info">
                <span class="activity-row-icon">${act.icon}</span>
                <div class="activity-row-title">${act.title.toUpperCase()}</div>
              </div>
              <div class="activity-row-actions">
                <button class="btn-touch btn-help-act" data-help-act="${act.id}" title="Co se v tomto úkolu dělá?" aria-label="Nápověda">?</button>
                ${
                  act.implementedInPrototype
                    ? `<button class="btn-touch btn-primary btn-launch-act" data-act-id="${act.id}">▶ HRÁT ${starBadge}</button>`
                    : `<button class="btn-touch btn-secondary btn-preview-act" data-act-id="${act.id}">🔊 INFO</button>`
                }
              </div>
            </div>
          `;
        })
        .join("");

      listEl.querySelectorAll("[data-help-act]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const act = this.catalog.activities.find((a) => a.id === btn.dataset.helpAct);
          if (act) {
            this.audio.playSfx("pop");
            this.audio.speak(act.audioIntroId);
          }
        });
      });

      listEl.querySelectorAll(".btn-launch-act").forEach((btn) => {
        btn.addEventListener("click", () => this.launchActivity(btn.dataset.actId, 1));
      });

      listEl.querySelectorAll(".btn-preview-act").forEach((btn) => {
        btn.addEventListener("click", () => {
          const act = this.catalog.activities.find((a) => a.id === btn.dataset.actId);
          if (act) {
            this.mascot.audio.playSfx("pop");
            this.mascot.audio.speak(act.audioIntroId);
          }
        });
      });

      this.zoneDrawer.classList.remove("hidden");
    }

    isFullscreenActive() {
      return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    }

    toggleFullscreen() {
      this.audio.playSfx("pop");
      const docEl = document.documentElement;
      if (!this.isFullscreenActive()) {
        const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
        if (req) {
          Promise.resolve(req.call(docEl))
            .then(() => {
              if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock("landscape").catch(() => {});
              }
            })
            .catch(() => {});
        }
      } else {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) {
          Promise.resolve(exit.call(document)).catch(() => {});
        }
      }
    }

    updateFullscreenUI() {
      const btn = document.getElementById("btn-fullscreen");
      const icon = document.getElementById("fullscreen-icon");
      const label = document.getElementById("fullscreen-label");
      if (!btn || !icon || !label) return;
      const active = this.isFullscreenActive();
      btn.classList.toggle("active", active);
      icon.textContent = active ? "🗗" : "⛶";
      label.textContent = active ? "UKONČIT" : "CELÁ OBRAZOVKA";
    }

    bindNavigation() {
      const fsBtn = document.getElementById("btn-fullscreen");
      if (fsBtn) {
        fsBtn.addEventListener("click", () => this.toggleFullscreen());
      }
      document.addEventListener("fullscreenchange", () => this.updateFullscreenUI());
      document.addEventListener("webkitfullscreenchange", () => this.updateFullscreenUI());

      document.getElementById("btn-close-drawer").addEventListener("click", () => {
        this.zoneDrawer.classList.add("hidden");
      });

      this.btnHome.addEventListener("click", () => this.goToMap());

      document.getElementById("btn-repeat-audio").addEventListener("click", () => {
        this.audio.repeatLast();
      });

      document.getElementById("penguin-svg").addEventListener("click", () => {
        this.mascot.emitParticles(["💙", "❄️", "✨"]);
        this.audio.repeatLast();
      });

      document.querySelectorAll(".btn-quick").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.launchActivity(btn.dataset.act, 1);
        });
      });

      this.levelStarsBar.querySelectorAll(".btn-star-level").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (!this.currentActivity) return;
          this.launchActivity(this.currentActivity.id, Number(btn.dataset.stars));
        });
      });
    }

    goToMap() {
      if (this.activeEngine && this.activeEngine.destroy) {
        this.activeEngine.destroy();
      }
      this.activeEngine = null;
      this.currentActivity = null;
      this.viewActivity.classList.add("hidden");
      this.viewMap.classList.remove("hidden");
      this.btnHome.classList.add("hidden");
      this.brandBadge.classList.remove("hidden");
      this.levelStarsBar.classList.add("hidden");
      document.querySelectorAll(".btn-quick").forEach((b) => b.classList.remove("active"));
      this.audio.speak("intro_map_select");
    }

    launchActivity(actId, stars = 1) {
      const activity = this.catalog.activities.find((a) => a.id === actId);
      if (!activity) return;

      if (this.activeEngine && this.activeEngine.destroy) {
        this.activeEngine.destroy();
      }

      this.currentActivity = activity;
      this.currentLevelStars = stars;
      const baseLevel =
        activity.levels.find((l) => l.stars === stars) ||
        activity.levels[activity.levels.length - 1] ||
        activity.levels[0];
      const level = {
        ...baseLevel,
        stars,
        config: { ...((baseLevel && baseLevel.config) || {}) }
      };

      this.zoneDrawer.classList.add("hidden");
      this.viewMap.classList.add("hidden");
      this.viewActivity.classList.remove("hidden");
      this.btnHome.classList.remove("hidden");
      this.brandBadge.classList.add("hidden");
      this.levelStarsBar.classList.remove("hidden");

      this.levelStarsBar.querySelectorAll(".btn-star-level").forEach((btn) => {
        btn.classList.toggle("active", Number(btn.dataset.stars) === stars);
      });
      document.querySelectorAll(".btn-quick").forEach((b) => {
        b.classList.toggle("active", b.dataset.act === actId);
      });

      const onComplete = () => {
        this.store.recordSuccess(activity.id, activity.zoneId, stars);
      };

      const engineMap = {
        step_draw: StepDrawActivity,
        color_mix: ColorMixActivity,
        build_color: BuildColorActivity,
        symmetry_draw: SymmetryDrawActivity,
        story_draw: HandwritingActivity,
        handwriting: HandwritingActivity,
        connect_dots: ConnectDotsActivity,
        tangram: TangramActivity,
        shadow_match: ShadowMatchActivity,
        visual_detective: VisualDetectiveActivity,
        puzzle: PuzzleActivity,
        first_letter: FirstLetterActivity,
        syllables: SyllablesActivity,
        letter_track: LetterTrackActivity,
        rhyme_memory: RhymeMemoryActivity,
        feed_penguin: FeedPenguinActivity,
        ice_scales: IceScalesActivity,
        story_math: StoryMathActivity,
        size_sort: SizeSortActivity,
        pattern_complete: PatternCompleteActivity,
        ice_maze: IceMazeActivity,
        sound_memory: SoundMemoryActivity,
        coding_path: CodingPathActivity,
        matrix_sort: MatrixSortActivity
      };

      const EngineClass = engineMap[activity.type] || StepDrawActivity;
      this.activeEngine = new EngineClass(
        this.workspaceEl,
        activity,
        level,
        this.mascot,
        this.store,
        onComplete
      );
    }
  }

  /* =========================================================================
   * 11. BOOTSTRAP APLIKACE A REGISTRACE SERVICE WORKERU
   * ========================================================================= */
  async function bootstrap() {
    let catalog = window.PENGUIN_WORLD_DATA.activitiesCatalog;
    let manifest = window.PENGUIN_WORLD_DATA.audioManifest;

    if (window.location.protocol !== "file:") {
      try {
        const [actRes, audRes] = await Promise.all([
          fetch("./data/activities.json?v=8"),
          fetch("./data/audio_manifest.json?v=8")
        ]);
        if (actRes.ok) catalog = await actRes.json();
        if (audRes.ok) manifest = await audRes.json();
      } catch (_err) {
        // Offline / lokální záloha z data-bundle.js
      }

      if ("caches" in window) {
        caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys.filter((k) => k !== "tucnakuv-svet-v8").map((k) => caches.delete(k))
            )
          )
          .catch(() => {});
      }

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .register("./sw.js?v=8")
          .then((reg) => {
            reg.update().catch(() => {});
          })
          .catch(() => {});
      }
    }

    window.penguinApp = new PenguinWorldApp(catalog, manifest);
  }

  document.addEventListener("DOMContentLoaded", bootstrap);
})();
