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

    speak(entryId, overrideText = null, options = {}) {
      const entry = this.manifestMap.get(entryId);
      const spokenText = overrideText || (entry ? entry.text_cs : entryId);
      const karaokeText = (overrideText || (entry ? entry.karaoke_text : spokenText)).toUpperCase();

      this.lastSpoken = { id: entryId, overrideText };
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

    speakViaWebSpeech(spokenText, wordSpans, voiceVol, onFinish) {
      const estimatedMs = Math.max(1500, spokenText.length * 68);
      if (!("speechSynthesis" in window) || voiceVol <= 0.01) {
        this.runHeuristicKaraoke(wordSpans, estimatedMs, onFinish);
        return;
      }

      const utter = new SpeechSynthesisUtterance(spokenText);
      utter.lang = "cs-CZ";
      utter.rate = 1.05;
      utter.pitch = 1.45;
      utter.volume = voiceVol;

      const voices = window.speechSynthesis.getVoices();
      const csVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("cs"));
      if (csVoice) utter.voice = csVoice;

      let boundaryFired = false;
      utter.onboundary = (ev) => {
        if (ev.name === "word" || typeof ev.charIndex === "number") {
          boundaryFired = true;
          const upTo = spokenText.slice(0, ev.charIndex).trim();
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
   * POMOCNÁ FUNKCE PRO POKRAČOVÁNÍ VE STEJNÉM STYLU (DALŠÍ ÚKOL)
   * ========================================================================= */
  function showContinueBanner(hostEl, options = {}) {
    const existing = hostEl.querySelector(".continue-banner");
    if (existing) existing.remove();

    const banner = document.createElement("div");
    banner.className = "continue-banner";
    const title = options.title || "🎉 PARÁDA! HOTOVO! CHCEŠ POKRAČOVAT DÁL?";
    const nextLabel = options.nextLabel || "▶️ DALŠÍ ÚKOL VE STEJNÉM STYLU ➔";
    banner.innerHTML = `
      <div class="continue-banner-text">${title}</div>
      <div class="continue-banner-btns">
        ${options.onReplay ? `<button type="button" class="btn-touch btn-secondary btn-banner-replay">🔄 ZNOVU</button>` : ""}
        <button type="button" class="btn-touch btn-next-task btn-banner-next">${nextLabel}</button>
      </div>
    `;

    const header = hostEl.querySelector(".workspace-header");
    if (header && header.nextSibling) {
      hostEl.insertBefore(banner, header.nextSibling);
    } else {
      hostEl.prepend(banner);
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

  const EXTRA_STEP_DRAW_TEMPLATES = [
    {
      title: "ZLATÁ RYBIČKA",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "body", label: "Tělíčko rybičky", audioId: "draw_step_oval", type: "ellipse", cx: 330, cy: 235, rx: 135, ry: 85, strokeColor: "#1D3557", fillColor: "#FFB703" },
        { id: "tail", label: "Ocásek a ploutvička", audioId: "draw_step_wings", type: "arcs", paths: [[[465, 235], [565, 155], [545, 315], [465, 235]], [[310, 150], [350, 95], [390, 155]]], strokeColor: "#1D3557", fillColor: "#F77F00" },
        { id: "eye", label: "Očičko a úsměv", audioId: "draw_step_face", type: "circle", cx: 245, cy: 215, r: 18, strokeColor: "#1D3557", fillColor: "#4CC9F0" }
      ]
    },
    {
      title: "VESELÉ SLUNÍČKO",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "sun", label: "Kulaté sluníčko", audioId: "draw_step_head", type: "circle", cx: 360, cy: 230, r: 95, strokeColor: "#F77F00", fillColor: "#FFD166" },
        { id: "rays", label: "Zlaté paprsky", audioId: "draw_step_wings", type: "arcs", paths: [[[360, 115], [360, 55]], [[360, 345], [360, 405]], [[245, 230], [175, 230]], [[475, 230], [545, 230]], [[275, 145], [225, 95]], [[445, 145], [495, 95]], [[275, 315], [225, 365]], [[445, 315], [495, 365]]], strokeColor: "#FFB703", fillColor: "#FFD166" },
        { id: "smile", label: "Oči a úsměv", audioId: "draw_step_face", type: "arcs", paths: [[[325, 210], [332, 210]], [[388, 210], [395, 210]], [[320, 255], [360, 285], [400, 255]]], strokeColor: "#1D3557", fillColor: "#E63946" }
      ]
    },
    {
      title: "RYCHLÉ AUTÍČKO",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "car_body", label: "Karoserie autíčka", audioId: "draw_step_oval", type: "ellipse", cx: 360, cy: 265, rx: 165, ry: 65, strokeColor: "#1D3557", fillColor: "#E63946" },
        { id: "cabin", label: "Střecha a okénko", audioId: "draw_step_wings", type: "arcs", paths: [[[245, 210], [295, 135], [425, 135], [470, 210]]], strokeColor: "#1D3557", fillColor: "#4CC9F0" },
        { id: "wheels", label: "Kulatá kola", audioId: "draw_step_head", type: "circle", cx: 265, cy: 330, r: 42, strokeColor: "#1D3557", fillColor: "#2B2D42" },
        { id: "wheel2", label: "Druhé kolo", audioId: "draw_step_head", type: "circle", cx: 455, cy: 330, r: 42, strokeColor: "#1D3557", fillColor: "#2B2D42" }
      ]
    },
    {
      title: "MOUDRÁ SOVIČKA",
      canvasWidth: 720,
      canvasHeight: 460,
      steps: [
        { id: "body", label: "Bříško sovičky", audioId: "draw_step_oval", type: "ellipse", cx: 360, cy: 255, rx: 110, ry: 130, strokeColor: "#1D3557", fillColor: "#8D6E63" },
        { id: "ears", label: "Ouška a křidélka", audioId: "draw_step_ears", type: "arcs", paths: [[[280, 150], [260, 85], [320, 128]], [[440, 150], [460, 85], [400, 128]], [[250, 220], [205, 290], [260, 325]], [[470, 220], [515, 290], [460, 325]]], strokeColor: "#1D3557", fillColor: "#6D4C41" },
        { id: "eyes", label: "Velké oči a zobáček", audioId: "draw_step_face", type: "arcs", paths: [[[320, 195], [326, 195]], [[395, 195], [401, 195]], [[345, 220], [360, 250], [375, 220], [345, 220]]], strokeColor: "#FFB703", fillColor: "#FFB703" }
      ]
    }
  ];

  /* =========================================================================
   * 4. HERNÍ ENGINE: ZÓNA A — KRESLENÍ KROK ZA KROKEM + MÍCHÁNÍ BAREV
   * ========================================================================= */
  class StepDrawActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.activity = activity;
      this.level = level;
      this.mascot = mascot;
      this.store = store;
      this.onComplete = onComplete;

      this.allTemplates = [
        ...(activity.levels || []).map((l) => l.config),
        ...EXTRA_STEP_DRAW_TEMPLATES
      ];
      this.templateIdx = Math.max(
        0,
        this.allTemplates.findIndex((t) => t.title === level.config.title)
      );

      this.activeColor = "#1D3557";
      this.brushSize = 11;
      this.mixSlots = [null, null];
      this.loadTemplate(this.allTemplates[this.templateIdx] || level.config);
    }

    loadTemplate(cfg) {
      this.currentConfig = cfg;
      this.steps = cfg.steps || [];
      this.currentStepIdx = 0;
      this.coloringMode = false;
      this.isDrawing = false;
      this.checkpoints = [];
      this.hitCount = 0;
      this.lastPt = null;

      this.render();
      this.prepareStep(0);
    }

    nextTemplate() {
      this.mascot.audio.playSfx("pop");
      this.templateIdx = (this.templateIdx + 1) % this.allTemplates.length;
      this.loadTemplate(this.allTemplates[this.templateIdx]);
    }

    render() {
      const cfg = this.currentConfig;
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">✏️ ${cfg.title}</h2>
          <div id="draw-step-pills" class="step-pills"></div>
          <div class="workspace-actions">
            <button id="btn-draw-skip-step" class="btn-touch btn-secondary">✨ DALŠÍ KROK</button>
            <button id="btn-draw-save" class="btn-touch btn-primary hidden">💾 ULOŽIT</button>
            <button id="btn-draw-next-template" class="btn-touch btn-next-task">🎨 DALŠÍ OBRÁZEK ➔</button>
          </div>
        </div>
        <div class="studio-layout">
          <div class="canvas-frame">
            <canvas id="step-draw-canvas" class="draw-canvas" width="${cfg.canvasWidth}" height="${cfg.canvasHeight}" draggable="false" style="touch-action:none; user-select:none;"></canvas>
          </div>
          <aside class="studio-sidebar">
            <div class="tool-box">
              <div class="tool-box-title">🖍️ BARVY PRO KRESLENÍ</div>
              <div id="draw-swatches" class="swatch-grid">
                ${[
                  { hex: "#1D3557", name: "TMAVĚ MODRÁ" },
                  { hex: "#E63946", name: "ČERVENÁ" },
                  { hex: "#FFD166", name: "ŽLUTÁ" },
                  { hex: "#118AB2", name: "MODRÁ" },
                  { hex: "#F77F00", name: "ORANŽOVÁ" },
                  { hex: "#06D6A0", name: "MÁTOVÁ" }
                ]
                  .map(
                    (c, i) =>
                      `<button class="btn-touch btn-swatch ${i === 0 ? "active" : ""}" data-color="${c.hex}" data-name="${c.name}" style="background:${c.hex}" aria-label="${c.name}"></button>`
                  )
                  .join("")}
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
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="btn-touch btn-secondary mix-pick" data-mix="yellow" data-hex="#FFD166" style="background:#FFD166;">ŽLUTÁ</button>
                <button class="btn-touch btn-secondary mix-pick" data-mix="blue" data-hex="#118AB2" style="background:#118AB2; color:#fff;">MODRÁ</button>
                <button class="btn-touch btn-secondary mix-pick" data-mix="red" data-hex="#E63946" style="background:#E63946; color:#fff;">ČERVENÁ</button>
              </div>
            </div>

            <div class="tool-box">
              <div class="tool-box-title">🧹 POMŮCKY</div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button id="btn-brush-thin" class="btn-touch btn-secondary">TENKÝ</button>
                <button id="btn-brush-thick" class="btn-touch btn-secondary">TLUSTÝ</button>
                <button id="btn-canvas-clear" class="btn-touch btn-secondary">ZNOVU</button>
              </div>
            </div>
          </aside>
        </div>
      `;

      this.canvas = document.getElementById("step-draw-canvas");
      this.ctx = this.canvas.getContext("2d");

      // Offscreen vrstva s vlastní kresbou dítěte
      this.paintLayer = document.createElement("canvas");
      this.paintLayer.width = cfg.canvasWidth;
      this.paintLayer.height = cfg.canvasHeight;
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
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch (_err) {
          // Ignorovat, pokud prohlížeč pointerCapture nepodporuje
        }
        this.isDrawing = true;
        this.lastPt = getPos(e);
        this.paintCtx.beginPath();
        this.paintCtx.arc(this.lastPt.x, this.lastPt.y, this.brushSize / 2, 0, Math.PI * 2);
        this.paintCtx.fillStyle = this.activeColor;
        this.paintCtx.fill();
        this.checkPointHit(this.lastPt);
        this.redraw();
        this.mascot.resetInactivityTimer(() => this.triggerHint());
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
        if (!this.lastPt) {
          this.lastPt = pt;
        }
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
          } catch (_err) {
            // Ignorovat
          }
        }
        this.isDrawing = false;
        this.lastPt = null;
        this.evaluateStepProgress();
      };

      this.canvas.addEventListener("pointerup", endStroke);
      this.canvas.addEventListener("pointercancel", endStroke);
      this.canvas.addEventListener("lostpointercapture", endStroke);

      // Barvy
      this.hostEl.querySelectorAll("#draw-swatches .btn-swatch").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.activeColor = btn.dataset.color;
          this.mascot.audio.playSfx("pop");
        });
      });

      // Kouzelné míchání barev
      this.hostEl.querySelectorAll(".mix-pick").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.handleColorMixPick(btn.dataset.mix, btn.dataset.hex);
        });
      });

      document.getElementById("btn-brush-thin").addEventListener("click", () => {
        this.brushSize = 8;
        this.mascot.audio.playSfx("pop");
      });
      document.getElementById("btn-brush-thick").addEventListener("click", () => {
        this.brushSize = 20;
        this.mascot.audio.playSfx("pop");
      });
      document.getElementById("btn-canvas-clear").addEventListener("click", () => {
        this.paintCtx.clearRect(0, 0, this.paintLayer.width, this.paintLayer.height);
        this.canvas.classList.remove("alive-bounce");
        this.coloringMode = false;
        document.getElementById("btn-draw-save").classList.add("hidden");
        document.getElementById("btn-draw-skip-step").classList.remove("hidden");
        this.prepareStep(0);
      });

      document.getElementById("btn-draw-skip-step").addEventListener("click", () => {
        this.completeCurrentStep();
      });

      document.getElementById("btn-draw-save").addEventListener("click", () => {
        const dataUrl = this.canvas.toDataURL("image/png");
        this.store.addArtwork(this.currentConfig.title, dataUrl);
        this.mascot.celebrate("celebrate_04");
        this.onComplete();
        showContinueBanner(this.hostEl, {
          title: "🎨 OBRÁZEK JE ULOŽENÝ! CHCEŠ KRESLIT DALŠÍ?",
          nextLabel: "🎨 DALŠÍ OBRÁZEK ➔",
          onNext: () => this.nextTemplate()
        });
      });

      const nextBtn = document.getElementById("btn-draw-next-template");
      if (nextBtn) {
        nextBtn.addEventListener("click", () => this.nextTemplate());
      }
    }

    handleColorMixPick(colorName, hex) {
      this.mascot.audio.playSfx("pop");
      const slot1 = document.getElementById("mix-slot-1");
      const slot2 = document.getElementById("mix-slot-2");
      const resBtn = document.getElementById("mix-result-btn");

      if (!this.mixSlots[0] || (this.mixSlots[0] && this.mixSlots[1])) {
        this.mixSlots = [{ name: colorName, hex }, null];
        slot1.style.background = hex;
        slot1.textContent = "";
        slot2.style.background = "#ffffff";
        slot2.textContent = "2";
        return;
      }

      this.mixSlots[1] = { name: colorName, hex };
      slot2.style.background = hex;
      slot2.textContent = "";

      const pair = [this.mixSlots[0].name, this.mixSlots[1].name].sort().join("+");
      let mixedHex = hex;
      let audioId = null;

      if (pair === "blue+yellow") {
        mixedHex = "#2A9D8F";
        audioId = "color_mix_yellow_blue";
      } else if (pair === "red+yellow") {
        mixedHex = "#F77F00";
        audioId = "color_mix_red_yellow";
      } else if (pair === "blue+red") {
        mixedHex = "#7209B7";
        audioId = "color_mix_red_blue";
      }

      resBtn.style.background = mixedHex;
      resBtn.textContent = "🎨";
      this.activeColor = mixedHex;
      this.brushSize = 18;
      this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => b.classList.remove("active"));
      resBtn.classList.add("active");
      this.mascot.audio.playSfx("mix");

      if (audioId) {
        this.mascot.emitParticles(["🎨", "✨", "🌈"]);
        this.mascot.audio.speak(audioId, null, {
          stateDuringSpeech: "HAPPY",
          stateAfterSpeech: "IDLE"
        });
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
        if (!cp.hit && Math.hypot(cp.x - pt.x, cp.y - pt.y) < 44) {
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
      if (ratio >= 0.72) {
        this.completeCurrentStep();
      }
    }

    prepareStep(idx) {
      this.currentStepIdx = idx;
      const pillsEl = document.getElementById("draw-step-pills");
      pillsEl.innerHTML = this.steps
        .map((s, i) => {
          const cls = i < idx ? "done" : i === idx ? "current" : "";
          return `<span class="step-pill ${cls}">${i + 1}. ${s.label.split(" ")[0].toUpperCase()}</span>`;
        })
        .join("");

      const step = this.steps[idx];
      this.checkpoints = this.buildCheckpointsForStep(step);
      this.hitCount = 0;
      this.redraw();

      this.mascot.audio.speak(step.audioId || "act_01_intro");
      this.mascot.resetInactivityTimer(() => this.triggerHint());
    }

    completeCurrentStep() {
      if (this.coloringMode) return;
      this.mascot.audio.playSfx("snap");
      this.mascot.emitParticles(["✨", "⭐"]);

      if (this.currentStepIdx + 1 < this.steps.length) {
        this.prepareStep(this.currentStepIdx + 1);
      } else {
        // Dokončeno: oživení kresby + odemčení vybarvování
        this.coloringMode = true;
        this.currentStepIdx = this.steps.length;
        const pillsEl = document.getElementById("draw-step-pills");
        pillsEl.innerHTML = `<span class="step-pill done">✨ VYBARVI SI OBRÁZEK NEBO POKRAČUJ DÁL!</span>`;
        document.getElementById("btn-draw-skip-step").classList.add("hidden");
        document.getElementById("btn-draw-save").classList.remove("hidden");
        this.canvas.classList.add("alive-bounce");
        this.redraw();
        this.mascot.celebrate(this.level.successAudioId || "draw_step_alive");
        this.onComplete();
        showContinueBanner(this.hostEl, {
          title: "🎉 OBRÁZEK OŽIL! MŮŽEŠ SI HO VYBARVIT NEBO KRESLIT DALŠÍ!",
          nextLabel: "🎨 DALŠÍ OBRÁZEK ➔",
          onNext: () => this.nextTemplate()
        });
      }
    }

    triggerHint() {
      if (this.coloringMode) return;
      this.mascot.gentleNudge("hint_draw_trace", null, true);
    }

    drawStepShape(ctx, step, styleMode) {
      ctx.save();
      if (styleMode === "guide") {
        ctx.strokeStyle = "#4CC9F0";
        ctx.lineWidth = 6;
        ctx.setLineDash([14, 10]);
      } else if (styleMode === "locked") {
        ctx.strokeStyle = step.strokeColor || "#1D3557";
        ctx.lineWidth = 5;
        ctx.setLineDash([]);
      }

      if (step.type === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(step.cx, step.cy, step.rx, step.ry, 0, 0, Math.PI * 2);
        if (styleMode === "locked" && this.coloringMode) {
          ctx.fillStyle = (step.fillColor || "#EAF4F8") + "22";
          ctx.fill();
        }
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
            ctx.fillStyle = step.strokeColor || "#1D3557";
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

      // Jemný papír
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Hotové předchozí kroky
      for (let i = 0; i < Math.min(this.currentStepIdx, this.steps.length); i++) {
        this.drawStepShape(ctx, this.steps[i], "locked");
      }

      // Aktuální přerušovaná šablona
      if (!this.coloringMode && this.currentStepIdx < this.steps.length) {
        this.drawStepShape(ctx, this.steps[this.currentStepIdx], "guide");
      }

      // Kresba dítěte
      ctx.drawImage(this.paintLayer, 0, 0);
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  /* =========================================================================
   * 5. HERNÍ ENGINE: ZÓNA A — SYMETRIE, MÍCHÁNÍ BAREV, PŘÍBĚH A SPOJOVAČKY
   * ========================================================================= */
  const SYMMETRY_MOTIFS = [
    { motif: "butterfly", title: "DOKRESLI MOTÝLKA" },
    { motif: "snowflake", title: "LEDOVÁ VLOČKA" },
    { motif: "crown", title: "KRÁLOVSKÁ KORUNA" },
    { motif: "heart", title: "KOUZELNÉ SRDÍČKO" },
    { motif: "ladybug", title: "VESELÁ BERUŠKA" },
    { motif: "flower", title: "ROZKVETLÁ KYTIČKA" },
    { motif: "star", title: "ZÁŘIVÁ HVĚZDIČKA" }
  ];

  class SymmetryDrawActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.store = store;
      this.onComplete = onComplete;

      this.autoMirror = level.config.autoMirror !== false;
      this.activeColor = "#FF5D8F";
      this.isDrawing = false;
      this.lastPt = null;
      this.strokesCount = 0;
      this.motifIdx = Math.max(
        0,
        SYMMETRY_MOTIFS.findIndex((m) => m.motif === level.config.motif)
      );

      this.render();
      this.drawGuideBackdrop();
      this.mascot.audio.speak("act_03_intro");
    }

    currentMotif() {
      return SYMMETRY_MOTIFS[this.motifIdx] || SYMMETRY_MOTIFS[0];
    }

    nextMotif() {
      this.mascot.audio.playSfx("pop");
      this.motifIdx = (this.motifIdx + 1) % SYMMETRY_MOTIFS.length;
      this.render();
      this.drawGuideBackdrop();
    }

    render() {
      const m = this.currentMotif();
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🦋 ${m.title}</h2>
          <div class="workspace-actions">
            <button id="btn-sym-toggle" class="btn-touch btn-primary">🪞 ZRCADLENÍ: ${this.autoMirror ? "ZAP" : "VYP"}</button>
            <button id="btn-sym-clear" class="btn-touch btn-secondary">ZNOVU</button>
            <button id="btn-sym-done" class="btn-touch btn-primary">✨ HOTOVO</button>
            <button id="btn-sym-next" class="btn-touch btn-next-task">🦋 DALŠÍ VZOR ➔</button>
          </div>
        </div>
        <div class="studio-layout">
          <div class="canvas-frame">
            <canvas id="sym-canvas" class="draw-canvas" width="760" height="460" draggable="false" style="touch-action:none; user-select:none;"></canvas>
          </div>
          <aside class="studio-sidebar">
            <div class="tool-box">
              <div class="tool-box-title">🎨 KOUZELNÉ BARVY</div>
              <div class="swatch-grid">
                ${["#FF5D8F", "#4CC9F0", "#FFB703", "#06D6A0", "#7209B7", "#1D3557"]
                  .map(
                    (hex, idx) =>
                      `<button class="btn-touch btn-swatch ${idx === 0 ? "active" : ""}" data-hex="${hex}" style="background:${hex}"></button>`
                  )
                  .join("")}
              </div>
            </div>
            <div class="tool-box">
              <div class="tool-box-title">💡 TIP OD PIKA</div>
              <p style="margin:0; font-weight:700; font-size:0.86rem; color:var(--navy-soft);">
                Kresli po pravé straně modré osy. Se zapnutým zrcadlením vznikne mandala!
              </p>
            </div>
          </aside>
        </div>
      `;

      this.canvas = document.getElementById("sym-canvas");
      this.ctx = this.canvas.getContext("2d");

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
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.strokeStyle = this.activeColor;
        this.ctx.lineWidth = 10;
        this.ctx.lineCap = "round";
        this.ctx.lineJoin = "round";
        this.ctx.stroke();

        if (this.autoMirror) {
          const w = this.canvas.width;
          this.ctx.beginPath();
          this.ctx.moveTo(w - p1.x, p1.y);
          this.ctx.lineTo(w - p2.x, p2.y);
          this.ctx.strokeStyle = this.activeColor;
          this.ctx.lineWidth = 10;
          this.ctx.lineCap = "round";
          this.ctx.lineJoin = "round";
          this.ctx.stroke();
        }
      };

      this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      this.canvas.addEventListener("dragstart", (e) => e.preventDefault());

      this.canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch (_err) {
          // Ignorovat
        }
        this.isDrawing = true;
        this.lastPt = getPos(e);
        drawSegment(this.lastPt, { x: this.lastPt.x + 0.1, y: this.lastPt.y + 0.1 });
        this.strokesCount += 1;
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
          } catch (_err) {
            // Ignorovat
          }
        }
        this.isDrawing = false;
        this.lastPt = null;
      };

      this.canvas.addEventListener("pointerup", stopSymDraw);
      this.canvas.addEventListener("pointercancel", stopSymDraw);
      this.canvas.addEventListener("lostpointercapture", stopSymDraw);

      this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => {
        b.addEventListener("click", () => {
          this.hostEl.querySelectorAll(".btn-swatch").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          this.activeColor = b.dataset.hex;
          this.mascot.audio.playSfx("pop");
        });
      });

      document.getElementById("btn-sym-toggle").addEventListener("click", (e) => {
        this.autoMirror = !this.autoMirror;
        e.currentTarget.textContent = `🪞 ZRCADLENÍ: ${this.autoMirror ? "ZAP" : "VYP"}`;
        this.mascot.audio.playSfx("pop");
      });

      document.getElementById("btn-sym-clear").addEventListener("click", () => {
        this.drawGuideBackdrop();
        this.mascot.audio.playSfx("pop");
      });

      document.getElementById("btn-sym-done").addEventListener("click", () => {
        this.store.addArtwork(this.currentMotif().title, this.canvas.toDataURL("image/png"));
        this.mascot.celebrate(this.level.successAudioId || "symmetry_done");
        this.onComplete();
        showContinueBanner(this.hostEl, {
          title: "🦋 NÁDHERNÁ SYMETRIE! CHCEŠ ZKUSIT DALŠÍ VZOR?",
          nextLabel: "🦋 DALŠÍ VZOR ➔",
          onNext: () => this.nextMotif()
        });
      });

      document.getElementById("btn-sym-next").addEventListener("click", () => {
        this.nextMotif();
      });
    }

    drawGuideBackdrop() {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const cx = w / 2;

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, w, h);

      // Osa souměrnosti
      ctx.save();
      ctx.strokeStyle = "#4CC9F0";
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(cx, 20);
      ctx.lineTo(cx, h - 20);
      ctx.stroke();

      // Levá předloha
      ctx.setLineDash([]);
      ctx.strokeStyle = "#1D3557";
      ctx.lineWidth = 6;
      const motif = this.currentMotif().motif;
      if (motif === "butterfly") {
        ctx.beginPath();
        ctx.ellipse(cx, 230, 14, 110, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 12, 175);
        ctx.bezierCurveTo(cx - 210, 40, cx - 260, 210, cx - 18, 235);
        ctx.bezierCurveTo(cx - 210, 270, cx - 180, 410, cx - 12, 310);
        ctx.stroke();
      } else if (motif === "snowflake") {
        for (let dy = -120; dy <= 120; dy += 60) {
          ctx.beginPath();
          ctx.moveTo(cx, 230 + dy);
          ctx.lineTo(cx - 160 + Math.abs(dy) * 0.5, 230 + dy - 40);
          ctx.stroke();
        }
      } else if (motif === "heart") {
        ctx.beginPath();
        ctx.moveTo(cx, 140);
        ctx.bezierCurveTo(cx - 90, 50, cx - 230, 150, cx, 360);
        ctx.stroke();
      } else if (motif === "ladybug") {
        ctx.beginPath();
        ctx.arc(cx, 240, 125, Math.PI * 0.5, Math.PI * 1.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx - 55, 200, 18, 0, Math.PI * 2);
        ctx.arc(cx - 70, 270, 22, 0, Math.PI * 2);
        ctx.stroke();
      } else if (motif === "flower") {
        ctx.beginPath();
        ctx.arc(cx, 230, 35, Math.PI * 0.5, Math.PI * 1.5);
        ctx.stroke();
        for (let a = 0.6; a <= 2.5; a += 0.6) {
          ctx.beginPath();
          ctx.arc(cx - Math.sin(a) * 85, 230 + Math.cos(a) * 85, 42, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (motif === "star") {
        ctx.beginPath();
        ctx.moveTo(cx, 75);
        ctx.lineTo(cx - 48, 175);
        ctx.lineTo(cx - 165, 185);
        ctx.lineTo(cx - 75, 260);
        ctx.lineTo(cx - 108, 370);
        ctx.lineTo(cx, 305);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(cx, 330);
        ctx.lineTo(cx - 170, 330);
        ctx.lineTo(cx - 190, 130);
        ctx.lineTo(cx - 95, 220);
        ctx.lineTo(cx, 105);
        ctx.stroke();
      }
      ctx.restore();
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  /* =========================================================================
   * 6. HERNÍ ENGINE: ZÓNA B — STAVITEL Z TVARŮ (TANGRAM)
   * ========================================================================= */
  const EXTRA_TANGRAM_TEMPLATES = [
    {
      title: "POLÁRNÍ STROMEČEK",
      snapTolerance: 34,
      allowRotation: false,
      pieces: [
        { id: "top", shape: "triangle", color: "#06D6A0", size: 95, targetX: 250, targetY: 95, targetRot: 0, startX: 540, startY: 85, startRot: 0, label: "Špička" },
        { id: "mid", shape: "triangle", color: "#2A9D8F", size: 120, targetX: 250, targetY: 185, targetRot: 0, startX: 540, startY: 195, startRot: 0, label: "Větve" },
        { id: "trunk", shape: "square", color: "#8D6E63", size: 70, targetX: 250, targetY: 280, targetRot: 0, startX: 540, startY: 315, startRot: 0, label: "Kmen" },
        { id: "star", shape: "circle", color: "#FFD166", size: 46, targetX: 250, targetY: 38, targetRot: 0, startX: 475, startY: 350, startRot: 0, label: "Hvězda" }
      ]
    },
    {
      title: "VESELÝ SNĚHULÁK",
      snapTolerance: 34,
      allowRotation: false,
      pieces: [
        { id: "base", shape: "circle", color: "#4CC9F0", size: 125, targetX: 250, targetY: 295, targetRot: 0, startX: 545, startY: 295, startRot: 0, label: "Spodní koule" },
        { id: "belly", shape: "circle", color: "#90E0EF", size: 95, targetX: 250, targetY: 195, targetRot: 0, startX: 545, startY: 175, startRot: 0, label: "Bříško" },
        { id: "head", shape: "circle", color: "#CAF0F8", size: 68, targetX: 250, targetY: 120, targetRot: 0, startX: 480, startY: 80, startRot: 0, label: "Hlava" },
        { id: "hat", shape: "triangle", color: "#FF595E", size: 72, targetX: 250, targetY: 62, targetRot: 0, startX: 585, startY: 80, startRot: 0, label: "Čepička" }
      ]
    },
    {
      title: "POLÁRNÍ VLÁČEK",
      snapTolerance: 32,
      allowRotation: true,
      pieces: [
        { id: "cab", shape: "square", color: "#FF595E", size: 96, targetX: 165, targetY: 195, targetRot: 0, startX: 540, startY: 75, startRot: 0, label: "Kabina" },
        { id: "boiler", shape: "square", color: "#1982C4", size: 96, targetX: 261, targetY: 195, targetRot: 0, startX: 540, startY: 185, startRot: 0, label: "Motor" },
        { id: "roof", shape: "triangle", color: "#FFCA3A", size: 96, targetX: 165, targetY: 99, targetRot: 0, startX: 475, startY: 290, startRot: 90, label: "Stříška" },
        { id: "w1", shape: "circle", color: "#2B2D42", size: 66, targetX: 165, targetY: 280, targetRot: 0, startX: 585, startY: 290, startRot: 0, label: "Zadní kolo" },
        { id: "w2", shape: "circle", color: "#2B2D42", size: 66, targetX: 265, targetY: 280, targetRot: 0, startX: 535, startY: 365, startRot: 0, label: "Přední kolo" }
      ]
    }
  ];

  class TangramActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.activity = activity;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;

      this.allBlueprints = [
        ...(activity.levels || []).map((l) => l.config),
        ...EXTRA_TANGRAM_TEMPLATES
      ];
      this.blueprintIdx = Math.max(
        0,
        this.allBlueprints.findIndex((b) => b.title === level.config.title)
      );

      this.loadBlueprint(this.allBlueprints[this.blueprintIdx] || level.config);
      this.mascot.audio.speak("act_06_intro");
    }

    loadBlueprint(cfg) {
      this.currentCfg = cfg;
      this.pieces = (cfg.pieces || []).map((p) => ({
        ...p,
        curX: p.startX,
        curY: p.startY,
        curRot: p.startRot || 0,
        locked: false
      }));
      this.selectedId = this.pieces[0] ? this.pieces[0].id : null;
      this.mistakes = 0;
      this.hintSlotId = null;
      this.dragState = null;

      this.render();
      this.mascot.resetInactivityTimer(() => this.triggerHint());
    }

    nextBlueprint() {
      this.mascot.audio.playSfx("pop");
      this.blueprintIdx = (this.blueprintIdx + 1) % this.allBlueprints.length;
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
            <button id="btn-tangram-next" class="btn-touch btn-next-task">🔷 DALŠÍ STAVBA ➔</button>
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
      document.getElementById("btn-tangram-next").addEventListener("click", () => {
        this.nextBlueprint();
      });

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

      // Oddělovač zásobníku dílků vpravo
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

      // Cílové stíny tvarů
      this.pieces.forEach((p) => {
        if (!p.locked) {
          this.svg.appendChild(this.createShapeElement(p, true));
        }
      });

      // Dílky (zamčené dole, aktivní nahoře)
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
        this.svg.setPointerCapture(e.pointerId);
        this.selectedId = piece.id;
        const p = this.svgPoint(e.clientX, e.clientY);
        this.dragState = {
          piece,
          offsetX: p.x - piece.curX,
          offsetY: p.y - piece.curY
        };
        this.mascot.audio.playSfx("pop");
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
      const tol = this.currentCfg.snapTolerance || 32;
      const dist = Math.hypot(piece.curX - piece.targetX, piece.curY - piece.targetY);

      if (dist <= tol && this.rotationMatches(piece)) {
        // Magnetické přichycení
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
            title: "🔷 SKVĚLÁ STAVBA! CHCEŠ POSTAVIT DALŠÍ OBRÁZEK?",
            nextLabel: "🔷 DALŠÍ STAVBA ➔",
            onNext: () => this.nextBlueprint()
          });
        }
        return;
      }

      // Pokud byl dílek puštěn na stavební ploše (vlevo od zásobníku), jemně vrátíme gumovým efektem
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
   * 7. HERNÍ ENGINE: ZÓNA C BONUS — PRVNÍ PÍSMENO
   * ========================================================================= */
  const EXTRA_FIRST_LETTER_POOL = [
    { word: "PES", emoji: "🐶", answer: "P", choices: ["P", "B", "M", "K"] },
    { word: "DŮM", emoji: "🏠", answer: "D", choices: ["T", "D", "L", "N"] },
    { word: "SOVA", emoji: "🦉", answer: "S", choices: ["S", "Z", "C", "V"] },
    { word: "VLK", emoji: "🐺", answer: "V", choices: ["V", "F", "B", "M"] },
    { word: "MEDVĚD", emoji: "🐻", answer: "M", choices: ["N", "M", "H", "P"] },
    { word: "KORUNA", emoji: "👑", answer: "K", choices: ["G", "K", "T", "R"] },
    { word: "JABLKO", emoji: "🍎", answer: "J", choices: ["J", "I", "L", "A"] },
    { word: "HRUŠKA", emoji: "🍐", answer: "H", choices: ["H", "K", "M", "R"] },
    { word: "BANÁN", emoji: "🍌", answer: "B", choices: ["P", "B", "D", "V"] },
    { word: "JEŽEK", emoji: "🦔", answer: "J", choices: ["J", "Z", "K", "L"] },
    { word: "ZEBRA", emoji: "🦓", answer: "Z", choices: ["S", "Z", "Ž", "C"] },
    { word: "HVĚZDA", emoji: "⭐", answer: "H", choices: ["H", "V", "N", "T"] }
  ];

  class FirstLetterActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.allPool = [...(level.config.rounds || []), ...EXTRA_FIRST_LETTER_POOL];
      this.poolCursor = 0;
      this.startNewSet(level.config.rounds || this.pickNextRounds());
    }

    pickNextRounds() {
      const picked = [];
      for (let i = 0; i < 3; i++) {
        picked.push(this.allPool[this.poolCursor % this.allPool.length]);
        this.poolCursor += 1;
      }
      return picked;
    }

    startNewSet(rounds) {
      this.rounds = rounds;
      this.roundIdx = 0;
      this.mistakes = 0;
      this.renderRound();
    }

    renderRound() {
      const round = this.rounds[this.roundIdx];
      if (!round) return;

      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🔤 NA JAKÉ PÍSMENO TO ZAČÍNÁ?</h2>
          <div class="workspace-actions">
            <span class="step-pill current">KOLO ${this.roundIdx + 1} / ${this.rounds.length}</span>
            <button id="btn-letter-next-set" class="btn-touch btn-next-task">🔤 DALŠÍ SLOVA ➔</button>
          </div>
        </div>
        <div class="letter-stage">
          <div class="word-picture-card">
            <span class="word-emoji">${round.emoji}</span>
            <span class="word-display">${round.word}</span>
            <button id="btn-say-word" class="btn-touch btn-primary">🔊 POSLECHNOUT</button>
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

      document.getElementById("btn-say-word").addEventListener("click", () => {
        if (round.audioId) {
          this.mascot.audio.speak(round.audioId);
        } else {
          this.mascot.audio.renderKaraokeWords(`${round.word}! NA JAKÉ PÍSMENO ZAČÍNÁ SLOVO ${round.word}?`);
          this.mascot.audio.speak("act_10_intro");
        }
      });

      document.getElementById("btn-letter-next-set").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.startNewSet(this.pickNextRounds());
      });

      this.hostEl.querySelectorAll(".btn-letter-choice").forEach((btn) => {
        btn.addEventListener("click", () => this.handleChoice(btn, round));
      });

      if (round.audioId) {
        this.mascot.audio.speak(round.audioId);
      } else {
        this.mascot.audio.renderKaraokeWords(`${round.word}! NA JAKÉ PÍSMENO ZAČÍNÁ SLOVO ${round.word}?`);
      }
      this.mascot.resetInactivityTimer(() => this.triggerHint(round));
    }

    handleChoice(btn, round) {
      const picked = btn.dataset.letter;
      if (picked === round.answer) {
        btn.classList.add("correct");
        this.mascot.audio.playSfx("snap");
        this.mascot.emitParticles(["⭐", "✨", "🔤"]);
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
              title: "🔤 VŠECHNA PÍSMENKA UHODNUTA! CHCEŠ DALŠÍ SLOVÍČKA?",
              nextLabel: "🔤 DALŠÍ SLOVÍČKA ➔",
              onNext: () => this.startNewSet(this.pickNextRounds())
            });
          }
        }, 650);
      } else {
        this.mistakes += 1;
        btn.classList.remove("gentle-nudge-anim");
        void btn.offsetWidth;
        btn.classList.add("gentle-nudge-anim");
        this.mascot.gentleNudge("hint_letter_listen", null, this.mistakes >= 2);
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
   * 8. HERNÍ ENGINE: ZÓNA D — KRMENÍ TUČŇÁKA (POČÍTÁNÍ RYBIČEK)
   * ========================================================================= */
  class FeedPenguinActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.rounds = [...(level.config.rounds || [3, 5, 4])];
      this.roundIdx = 0;
      this.bowlCount = 0;
      this.mistakes = 0;

      this.renderRound();
    }

    generateMoreRounds() {
      const min = this.level.config.minTarget || 2;
      const max = this.level.config.maxTarget || 6;
      const next = [];
      for (let i = 0; i < 3; i++) {
        next.push(min + Math.floor(Math.random() * (max - min + 1)));
      }
      this.rounds = next;
      this.roundIdx = 0;
      this.renderRound();
    }

    targetCount() {
      return this.rounds[this.roundIdx] || 3;
    }

    renderRound() {
      const target = this.targetCount();
      const pondTotal = Math.max(target + 3, this.level.config.pondCount || 10);
      this.bowlCount = 0;
      this.mistakes = 0;

      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🐟 NAKRM PIKA PŘESNĚ ${target} RYBIČKAMI!</h2>
          <div class="workspace-actions">
            <span class="step-pill current">KOLO ${this.roundIdx + 1} / ${this.rounds.length}</span>
            <button id="btn-feed-more" class="btn-touch btn-next-task">🐟 DALŠÍ KRMENÍ ➔</button>
          </div>
        </div>
        <div class="feed-layout">
          <section class="pond-panel">
            <div class="panel-heading">
              <span>🌊 ARKTICKÉ JEZÍRKO (ŤUKNI NA RYBIČKU)</span>
              <span>CÍL: ${target}</span>
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
      const askId = "feed_ask_" + String(target).padStart(2, "0");
      this.mascot.audio.speak(askId);
      this.mascot.resetInactivityTimer(() => {
        this.mascot.gentleNudge("hint_count_more", null, true);
      });
    }

    bindEvents() {
      const pondGrid = document.getElementById("fish-pond-grid");
      const bowlEl = document.getElementById("bowl-dropzone");

      document.getElementById("btn-feed-more").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.generateMoreRounds();
      });

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
          }, 1400);
        } else {
          this.mascot.clearInactivityTimer();
          this.mascot.celebrate(this.level.successAudioId || "celebrate_03");
          this.onComplete();
          showContinueBanner(this.hostEl, {
            title: "🐟 PIKO MÁ PLNÉ BŘÍŠKO! CHCEŠ POČÍTAT DALŠÍ RYBIČKY?",
            nextLabel: "🐟 DALŠÍ KRMENÍ ➔",
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

  // --- AKTIVITA 2: KOUZELNÉ OMALOVÁNKY S MÍCHÁNÍM BAREV ---
  const COLORING_PICTURES = [
    {
      title: "DUHOVÁ RYBIČKA",
      parts: [
        { id: "body", label: "Tělíčko", d: "M 180 220 C 260 110, 440 110, 500 220 C 440 330, 260 330, 180 220 Z" },
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
        { id: "scoop1", label: "Spodní kopeček", d: "M 260 230 A 60 55 0 1 1 370 230 Z" },
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

  class ColorMixActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.store = store;
      this.onComplete = onComplete;
      this.picIdx = 0;
      this.activeColor = "#2A9D8F";
      this.mixSlots = [null, null];
      this.mascot.audio.speak("act_02_intro");
      this.loadPicture(0);
    }

    loadPicture(idx) {
      this.picIdx = idx % COLORING_PICTURES.length;
      this.coloredParts = {};
      this.render();
    }

    nextPicture() {
      this.mascot.audio.playSfx("pop");
      this.loadPicture(this.picIdx + 1);
    }

    render() {
      const pic = COLORING_PICTURES[this.picIdx];
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🖌️ MÍCHÁNÍ BAREV: ${pic.title}</h2>
          <div class="workspace-actions">
            <span class="step-pill current" id="color-mix-prog">VYBARVENO: 0 / ${pic.parts.length}</span>
            <button id="btn-cmix-next" class="btn-touch btn-next-task">🖌️ DALŠÍ OMALOVÁNKA ➔</button>
          </div>
        </div>
        <div class="studio-layout">
          <div class="canvas-frame">
            <svg id="cmix-svg" viewBox="0 0 720 440" style="width:100%; height:100%; max-height:100%;">
              ${pic.parts
                .map(
                  (p) =>
                    `<path data-part="${p.id}" d="${p.d}" fill="#FFFFFF" stroke="#1D3557" stroke-width="6" stroke-linejoin="round" style="cursor:pointer; transition:fill 0.2s ease;" />`
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
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="btn-touch btn-secondary cm-pick" data-mix="yellow" data-hex="#FFD166" style="background:#FFD166;">ŽLUTÁ</button>
                <button class="btn-touch btn-secondary cm-pick" data-mix="blue" data-hex="#118AB2" style="background:#118AB2; color:#fff;">MODRÁ</button>
                <button class="btn-touch btn-secondary cm-pick" data-mix="red" data-hex="#E63946" style="background:#E63946; color:#fff;">ČERVENÁ</button>
              </div>
            </div>
            <div class="tool-box">
              <div class="tool-box-title">🎨 PALETA BAREV</div>
              <div class="swatch-grid">
                ${["#2A9D8F", "#F77F00", "#7209B7", "#FFD166", "#118AB2", "#E63946", "#FF5D8F", "#06D6A0"]
                  .map(
                    (hex) =>
                      `<button class="btn-touch btn-swatch ${hex === this.activeColor ? "active" : ""}" data-hex="${hex}" style="background:${hex}"></button>`
                  )
                  .join("")}
              </div>
            </div>
          </aside>
        </div>
      `;

      document.getElementById("btn-cmix-next").addEventListener("click", () => this.nextPicture());

      this.hostEl.querySelectorAll(".btn-swatch[data-hex]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.activeColor = btn.dataset.hex;
          this.mascot.audio.playSfx("pop");
        });
      });

      this.hostEl.querySelectorAll(".cm-pick").forEach((btn) => {
        btn.addEventListener("click", () => {
          const name = btn.dataset.mix;
          const hex = btn.dataset.hex;
          this.mascot.audio.playSfx("pop");
          const s1 = document.getElementById("cm-slot-1");
          const s2 = document.getElementById("cm-slot-2");
          const res = document.getElementById("cm-result");
          if (!this.mixSlots[0] || (this.mixSlots[0] && this.mixSlots[1])) {
            this.mixSlots = [{ name, hex }, null];
            s1.style.background = hex;
            s1.textContent = "";
            s2.style.background = "#ffffff";
            s2.textContent = "2";
            return;
          }
          this.mixSlots[1] = { name, hex };
          s2.style.background = hex;
          s2.textContent = "";
          const pair = [this.mixSlots[0].name, this.mixSlots[1].name].sort().join("+");
          let mixedHex = hex;
          let audioId = null;
          if (pair === "blue+yellow") {
            mixedHex = "#2A9D8F";
            audioId = "color_mix_yellow_blue";
          } else if (pair === "red+yellow") {
            mixedHex = "#F77F00";
            audioId = "color_mix_red_yellow";
          } else if (pair === "blue+red") {
            mixedHex = "#7209B7";
            audioId = "color_mix_red_blue";
          }
          this.activeColor = mixedHex;
          res.style.background = mixedHex;
          this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => b.classList.remove("active"));
          res.classList.add("active");
          this.mascot.audio.playSfx("mix");
          if (audioId) this.mascot.audio.speak(audioId);
        });
      });

      this.hostEl.querySelectorAll("#cmix-svg path[data-part]").forEach((pathEl) => {
        pathEl.addEventListener("click", () => {
          const partId = pathEl.dataset.part;
          pathEl.setAttribute("fill", this.activeColor);
          this.coloredParts[partId] = this.activeColor;
          this.mascot.audio.playSfx("snap");
          const doneCount = Object.keys(this.coloredParts).length;
          document.getElementById("color-mix-prog").textContent = `VYBARVENO: ${doneCount} / ${pic.parts.length}`;
          if (doneCount === pic.parts.length) {
            this.mascot.celebrate(this.level.successAudioId || "celebrate_04");
            this.onComplete();
            showContinueBanner(this.hostEl, {
              title: "🌈 KRÁSNĚ VYBARVENO! CHCEŠ DALŠÍ OMALOVÁNKU?",
              nextLabel: "🖌️ DALŠÍ OMALOVÁNKA ➔",
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

  // --- AKTIVITA 4: DOKRESLI PŘÍBĚH ---
  const STORY_SCENES = [
    {
      id: "rain",
      title: "DEŠTNÍK PRO TUČŇÁKA",
      prompt: "PRŠÍ! DOKRESLI PIKOVI NAD HLAVOU VELKÝ DEŠTNÍK!",
      guidePts: [[230, 190], [290, 120], [360, 100], [430, 120], [490, 190], [360, 190], [360, 290]]
    },
    {
      id: "car",
      title: "KOLA PRO AUTÍČKO",
      prompt: "AUTÍČKO NEMŮŽE JET! DOKRESLI MU DOLE DVĚ KULATÁ KOLA!",
      guidePts: [[235, 315], [275, 315], [255, 345], [445, 315], [485, 315], [465, 345]]
    },
    {
      id: "dragon",
      title: "KŘÍDLA PRO DRÁČKA",
      prompt: "DRÁČEK CHCE LÉTAT! DOKRESLI MU NA ZÁDA VELKÁ KŘÍDLA!",
      guidePts: [[280, 220], [180, 120], [150, 230], [440, 220], [540, 120], [570, 230]]
    },
    {
      id: "boat",
      title: "PLACHTA PRO LOĎKU",
      prompt: "FOUKÁ VÍTR! DOKRESLI LOĎCE VELKOU TROJÚHELNÍKOVOU PLACHTU!",
      guidePts: [[360, 105], [360, 275], [490, 275], [425, 185]]
    },
    {
      id: "flower",
      title: "SLUNÍČKO PRO KYTIČKU",
      prompt: "KYTIČKA CHCE RŮST! DOKRESLI NA OBLOHU ZÁŘIVÉ SLUNÍČKO!",
      guidePts: [[520, 110], [560, 110], [540, 80], [540, 140]]
    }
  ];

  class StoryDrawActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.store = store;
      this.onComplete = onComplete;
      this.sceneIdx = Math.max(0, STORY_SCENES.findIndex((s) => s.id === level.config.scene));
      this.activeColor = "#E63946";
      this.mascot.audio.speak("act_04_intro");
      this.loadScene(this.sceneIdx);
    }

    loadScene(idx) {
      this.sceneIdx = idx % STORY_SCENES.length;
      this.scene = STORY_SCENES[this.sceneIdx];
      this.checkpoints = this.scene.guidePts.map(([x, y]) => ({ x, y, hit: false }));
      this.completed = false;
      this.isDrawing = false;
      this.lastPt = null;
      this.render();
      this.mascot.audio.renderKaraokeWords(this.scene.prompt);
    }

    nextScene() {
      this.mascot.audio.playSfx("pop");
      this.loadScene(this.sceneIdx + 1);
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">☔ ${this.scene.title}</h2>
          <div class="workspace-actions">
            <button id="btn-story-clear" class="btn-touch btn-secondary">ZNOVU</button>
            <button id="btn-story-done" class="btn-touch btn-primary">✨ HOTOVO</button>
            <button id="btn-story-next" class="btn-touch btn-next-task">☔ DALŠÍ PŘÍBĚH ➔</button>
          </div>
        </div>
        <div class="studio-layout">
          <div class="canvas-frame">
            <canvas id="story-canvas" class="draw-canvas" width="720" height="460" draggable="false" style="touch-action:none; user-select:none;"></canvas>
          </div>
          <aside class="studio-sidebar">
            <div class="tool-box">
              <div class="tool-box-title">🖍️ PASTELKY</div>
              <div class="swatch-grid">
                ${["#E63946", "#FFB703", "#118AB2", "#06D6A0", "#7209B7", "#1D3557"]
                  .map(
                    (hex, i) =>
                      `<button class="btn-touch btn-swatch ${i === 0 ? "active" : ""}" data-hex="${hex}" style="background:${hex}"></button>`
                  )
                  .join("")}
              </div>
            </div>
            <div class="tool-box">
              <div class="tool-box-title">📖 ÚKOL</div>
              <p style="margin:0; font-weight:800; font-size:0.86rem; color:var(--navy);">${this.scene.prompt}</p>
            </div>
          </aside>
        </div>
      `;

      this.canvas = document.getElementById("story-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.paintLayer = document.createElement("canvas");
      this.paintLayer.width = 720;
      this.paintLayer.height = 460;
      this.paintCtx = this.paintLayer.getContext("2d");

      this.redraw();

      const getPos = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        return {
          x: ((e.clientX - rect.left) / (rect.width || 1)) * this.canvas.width,
          y: ((e.clientY - rect.top) / (rect.height || 1)) * this.canvas.height
        };
      };

      this.canvas.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        try { this.canvas.setPointerCapture(e.pointerId); } catch (_e) {}
        this.isDrawing = true;
        this.lastPt = getPos(e);
        this.checkHit(this.lastPt);
        this.redraw();
      });

      this.canvas.addEventListener("pointermove", (e) => {
        if (!this.isDrawing && e.buttons !== 1) return;
        this.isDrawing = true;
        const pt = getPos(e);
        if (!this.lastPt) this.lastPt = pt;
        this.paintCtx.beginPath();
        this.paintCtx.moveTo(this.lastPt.x, this.lastPt.y);
        this.paintCtx.lineTo(pt.x, pt.y);
        this.paintCtx.strokeStyle = this.activeColor;
        this.paintCtx.lineWidth = 12;
        this.paintCtx.lineCap = "round";
        this.paintCtx.stroke();
        this.checkHit(pt);
        this.lastPt = pt;
        this.redraw();
      });

      const stop = () => {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        this.lastPt = null;
        const hits = this.checkpoints.filter((c) => c.hit).length;
        if (!this.completed && hits >= Math.ceil(this.checkpoints.length * 0.65)) {
          this.finishStory();
        }
      };
      this.canvas.addEventListener("pointerup", stop);
      this.canvas.addEventListener("pointercancel", stop);

      this.hostEl.querySelectorAll(".btn-swatch").forEach((b) => {
        b.addEventListener("click", () => {
          this.hostEl.querySelectorAll(".btn-swatch").forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          this.activeColor = b.dataset.hex;
          this.mascot.audio.playSfx("pop");
        });
      });

      document.getElementById("btn-story-clear").addEventListener("click", () => {
        this.paintCtx.clearRect(0, 0, 720, 460);
        this.checkpoints.forEach((c) => (c.hit = false));
        this.completed = false;
        this.redraw();
      });
      document.getElementById("btn-story-done").addEventListener("click", () => this.finishStory());
      document.getElementById("btn-story-next").addEventListener("click", () => this.nextScene());
    }

    checkHit(pt) {
      this.checkpoints.forEach((c) => {
        if (Math.hypot(c.x - pt.x, c.y - pt.y) < 52) c.hit = true;
      });
    }

    finishStory() {
      if (this.completed) return;
      this.completed = true;
      this.store.addArtwork(this.scene.title, this.canvas.toDataURL("image/png"));
      this.mascot.celebrate("celebrate_04");
      this.onComplete();
      showContinueBanner(this.hostEl, {
        title: "🎉 PŘÍBĚH JE ZACHRÁNĚN! CHCEŠ DOKRESLIT DALŠÍ?",
        nextLabel: "☔ DALŠÍ PŘÍBĚH ➔",
        onNext: () => this.nextScene()
      });
    }

    redraw() {
      const ctx = this.ctx;
      ctx.fillStyle = "#F8FCFF";
      ctx.fillRect(0, 0, 720, 460);

      // Scéna příběhu + tečkovaná nápověda
      ctx.save();
      ctx.font = "72px sans-serif";
      ctx.textAlign = "center";
      if (this.scene.id === "rain") {
        ctx.fillText("🌧️   🌧️   🌧️", 360, 70);
        ctx.fillText("🐧", 360, 360);
      } else if (this.scene.id === "car") {
        ctx.fillStyle = "#4CC9F0";
        ctx.fillRect(200, 190, 320, 110);
        ctx.fillText("🚙", 360, 270);
      } else if (this.scene.id === "dragon") {
        ctx.fillText("🐲", 360, 290);
      } else if (this.scene.id === "boat") {
        ctx.fillStyle = "#8D6E63";
        ctx.beginPath();
        ctx.moveTo(200, 290);
        ctx.lineTo(520, 290);
        ctx.lineTo(460, 370);
        ctx.lineTo(260, 370);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillText("🌻 🌱 🌷", 320, 360);
      }

      // Tečkovaný obrys toho, co má dítě dokreslit
      ctx.strokeStyle = "#90E0EF";
      ctx.lineWidth = 6;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      this.scene.guidePts.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();

      ctx.drawImage(this.paintLayer, 0, 0);
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 5: SPOJOVAČKY S ODHALENÍM ---
  const DOT_TO_DOT_TEMPLATES = [
    {
      title: "ZÁŘIVÁ HVĚZDIČKA",
      emoji: "⭐",
      color: "#FFB703",
      pts: [[360, 65], [420, 180], [550, 195], [450, 280], [480, 405], [360, 340], [240, 405], [270, 280], [170, 195], [300, 180]]
    },
    {
      title: "POLÁRNÍ DOMEČEK",
      emoji: "🏠",
      color: "#06D6A0",
      pts: [[360, 70], [520, 190], [480, 190], [480, 385], [240, 385], [240, 190], [200, 190]]
    },
    {
      title: "PLACHETNICE",
      emoji: "⛵",
      color: "#118AB2",
      pts: [[350, 70], [490, 260], [350, 260], [540, 285], [470, 380], [250, 380], [180, 285], [350, 260]]
    },
    {
      title: "KRÁLOVSKÁ KORUNA",
      emoji: "👑",
      color: "#F77F00",
      pts: [[180, 350], [160, 145], [265, 235], [360, 95], [455, 235], [560, 145], [540, 350]]
    },
    {
      title: "KOUZELNÉ SRDÍČKO",
      emoji: "❤️",
      color: "#FF5D8F",
      pts: [[360, 145], [450, 75], [550, 140], [530, 260], [360, 395], [190, 260], [170, 140], [270, 75]]
    }
  ];

  class ConnectDotsActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.useLetters = Boolean(level.config.letters);
      this.tplIdx = 0;
      this.mascot.audio.speak("act_05_intro");
      this.loadTemplate(0);
    }

    loadTemplate(idx) {
      this.tplIdx = idx % DOT_TO_DOT_TEMPLATES.length;
      this.tpl = DOT_TO_DOT_TEMPLATES[this.tplIdx];
      this.currentDot = 0;
      this.finished = false;
      this.render();
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
            <span class="step-pill current" id="dots-status">NAJDI BOD: ${this.labelFor(0)}</span>
            <button id="btn-dots-next" class="btn-touch btn-next-task">✨ DALŠÍ SPOJOVAČKA ➔</button>
          </div>
        </div>
        <div class="tangram-board-wrap">
          <canvas id="dots-canvas" class="draw-canvas" width="720" height="440" style="touch-action:none;"></canvas>
        </div>
      `;

      this.canvas = document.getElementById("dots-canvas");
      this.ctx = this.canvas.getContext("2d");
      document.getElementById("btn-dots-next").addEventListener("click", () => this.nextTemplate());

      const handlePoint = (e) => {
        if (this.finished) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / (rect.width || 1)) * this.canvas.width;
        const y = ((e.clientY - rect.top) / (rect.height || 1)) * this.canvas.height;
        const [tx, ty] = this.tpl.pts[this.currentDot];
        if (Math.hypot(x - tx, y - ty) < 46) {
          this.currentDot += 1;
          this.mascot.audio.playSfx("count");
          this.draw();
          if (this.currentDot >= this.tpl.pts.length) {
            this.finished = true;
            this.draw();
            this.mascot.celebrate("celebrate_01");
            this.onComplete();
            showContinueBanner(this.hostEl, {
              title: `${this.tpl.emoji} ${this.tpl.title} JE NA SVĚTĚ! CHCEŠ DALŠÍ SPOJOVAČKU?`,
              nextLabel: "✨ DALŠÍ SPOJOVAČKA ➔",
              onNext: () => this.nextTemplate()
            });
          } else {
            document.getElementById("dots-status").textContent = `NAJDI BOD: ${this.labelFor(this.currentDot)}`;
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

      // Spojené čáry
      if (this.currentDot > 1 || this.finished) {
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < this.currentDot; i++) {
          const [x, y] = this.tpl.pts[i];
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        if (this.finished) {
          ctx.closePath();
          ctx.fillStyle = this.tpl.color + "44";
          ctx.fill();
        }
        ctx.strokeStyle = this.tpl.color;
        ctx.lineWidth = 8;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();
      }

      // Body
      this.tpl.pts.forEach(([x, y], i) => {
        const isDone = i < this.currentDot;
        const isCurrent = i === this.currentDot && !this.finished;
        ctx.beginPath();
        ctx.arc(x, y, isCurrent ? 26 : 21, 0, Math.PI * 2);
        ctx.fillStyle = isDone ? "#06D6A0" : isCurrent ? "#FFB703" : "#E6F4FC";
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = isCurrent ? "#F77F00" : "#1D3557";
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

  // --- AKTIVITA 7: HLEDAČ STÍNŮ A SILUET ---
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
    { emoji: "🎸", name: "KYTARA" }
  ];

  class ShadowMatchActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.cursor = 0;
      this.mascot.audio.speak("act_07_intro");
      this.nextRound();
    }

    nextRound() {
      const count = Math.min(5, this.level.config.pairs || 3);
      this.items = [];
      for (let i = 0; i < count; i++) {
        this.items.push(SHADOW_ITEMS_POOL[(this.cursor + i) % SHADOW_ITEMS_POOL.length]);
      }
      this.cursor += count;
      this.shadows = [...this.items].sort(() => Math.random() - 0.5);
      this.selectedEmoji = this.items[0].emoji;
      this.matched = new Set();
      this.render();
    }

    render() {
      const rotated = Boolean(this.level.config.rotated);
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🌗 NAJDI SPRÁVNÝ STÍN!</h2>
          <div class="workspace-actions">
            <span class="step-pill current">NALEZENO: ${this.matched.size} / ${this.items.length}</span>
            <button id="btn-shadow-next" class="btn-touch btn-next-task">🌗 DALŠÍ STÍNY ➔</button>
          </div>
        </div>
        <div class="interactive-stage">
          <div style="font-weight:900; color:var(--navy-soft);">1. VYBER BAREVNÝ OBRÁZEK DOLE A ŤUKNI NA JEHO TMAVÝ STÍN NAHOŘE:</div>
          <div class="cards-grid">
            ${this.shadows
              .map((it, idx) => {
                const isDone = this.matched.has(it.emoji);
                const rot = rotated && !isDone ? (idx % 2 === 0 ? "rotate(18deg)" : "rotate(-18deg)") : "none";
                return `
                  <button class="game-card ${isDone ? "matched" : ""}" data-shadow="${it.emoji}">
                    <span class="game-card-emoji ${isDone ? "" : "silhouette-emoji"}" style="transform:${rot}">${it.emoji}</span>
                    <span class="game-card-label">${isDone ? it.name : "❓ STÍN"}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
          <div class="cards-grid">
            ${this.items
              .map((it) => {
                const isDone = this.matched.has(it.emoji);
                const isSel = this.selectedEmoji === it.emoji && !isDone;
                return `
                  <button class="game-card ${isDone ? "matched" : isSel ? "selected" : ""}" data-pick="${it.emoji}" ${isDone ? "disabled" : ""}>
                    <span class="game-card-emoji">${it.emoji}</span>
                    <span class="game-card-label">${it.name}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `;

      document.getElementById("btn-shadow-next").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.nextRound();
      });

      this.hostEl.querySelectorAll("[data-pick]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.selectedEmoji = btn.dataset.pick;
          this.mascot.audio.playSfx("pop");
          this.render();
        });
      });

      this.hostEl.querySelectorAll("[data-shadow]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = btn.dataset.shadow;
          if (this.matched.has(target)) return;
          if (this.selectedEmoji === target) {
            this.matched.add(target);
            this.mascot.audio.playSfx("snap");
            this.mascot.emitParticles(["⭐", "✨"]);
            const nextUnmatched = this.items.find((i) => !this.matched.has(i.emoji));
            this.selectedEmoji = nextUnmatched ? nextUnmatched.emoji : null;
            this.render();
            if (this.matched.size === this.items.length) {
              this.mascot.celebrate(this.level.successAudioId || "celebrate_02");
              this.onComplete();
              showContinueBanner(this.hostEl, {
                title: "🌗 VŠECHNY STÍNY NALEZENY! CHCEŠ HLEDAT DALŠÍ?",
                nextLabel: "🌗 DALŠÍ STÍNY ➔",
                onNext: () => this.nextRound()
              });
            }
          } else {
            btn.classList.add("gentle-nudge-anim");
            this.mascot.gentleNudge("hint_shape_size");
          }
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 8: CO DO OBRÁZKU NEPATŘÍ? (VIZUÁLNÍ DETEKTIV) ---
  const DETECTIVE_SCENES = [
    { title: "ZIMA NA LEDOVCI", normal: ["🐧", "🐻‍❄️", "🦭", "❄️", "⛄"], odd: ["🌴", "🍕", "🚗"] },
    { title: "KOŠÍK S OVOCEM", normal: ["🍎", "🍐", "🍌", "🍓", "🍒"], odd: ["👟", "⚽", "🔨"] },
    { title: "PODMOŘSKÝ SVĚT", normal: ["🐟", "🐳", "🐙", "🦀", "🐬"], odd: ["🚜", "🌵", "🎸"] },
    { title: "DOPRAVNÍ PROSTŘEDKY", normal: ["🚗", "🚌", "🚂", "✈️", "⛵"], odd: ["🐸", "🍦", "🍄"] },
    { title: "LESNÍ ZVÍŘÁTKA", normal: ["🦊", "🦉", "🦌", "🐿️", "🦔"], odd: ["🚀", "📺", "🩱"] }
  ];

  class VisualDetectiveActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.sceneIdx = 0;
      this.mascot.audio.speak("act_08_intro");
      this.loadScene(0);
    }

    loadScene(idx) {
      this.sceneIdx = idx % DETECTIVE_SCENES.length;
      const sc = DETECTIVE_SCENES[this.sceneIdx];
      this.sceneTitle = sc.title;
      this.oddSet = new Set(sc.odd);
      this.found = new Set();
      this.cards = [...sc.normal, ...sc.odd].sort(() => Math.random() - 0.5);
      this.render();
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🔍 DETEKTIV: ${this.sceneTitle}</h2>
          <div class="workspace-actions">
            <span class="step-pill current">NAJDI ${this.oddSet.size} VĚCI, KTERÉ SEM NEPATŘÍ (${this.found.size}/${this.oddSet.size})</span>
            <button id="btn-det-next" class="btn-touch btn-next-task">🔍 DALŠÍ PÁTRÁNÍ ➔</button>
          </div>
        </div>
        <div class="interactive-stage">
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

      document.getElementById("btn-det-next").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.loadScene(this.sceneIdx + 1);
      });

      this.hostEl.querySelectorAll(".game-card").forEach((btn) => {
        btn.addEventListener("click", () => {
          const em = btn.dataset.em;
          if (this.found.has(em)) return;
          if (this.oddSet.has(em)) {
            this.found.add(em);
            this.mascot.audio.playSfx("snap");
            this.mascot.emitParticles(["🔍", "⭐"]);
            this.render();
            if (this.found.size === this.oddSet.size) {
              this.mascot.celebrate("celebrate_02");
              this.onComplete();
              showContinueBanner(this.hostEl, {
                title: "🔍 VŠECHNY NESMYSLY ODHALENY! CHCEŠ DALŠÍ PŘÍPAD?",
                nextLabel: "🔍 DALŠÍ PÁTRÁNÍ ➔",
                onNext: () => this.loadScene(this.sceneIdx + 1)
              });
            }
          } else {
            btn.classList.add("gentle-nudge-anim");
            this.mascot.gentleNudge("hint_idle_encourage");
          }
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 9: SKLÁDÁNÍ ROZSTŘÍHANÝCH OBRÁZKŮ (LEDOVÉ PUZZLE) ---
  const PUZZLE_THEMES = [
    { title: "POLÁRNÍ DRUŽINA", bg: "#DFF4FF", grid: ["☀️", "☁️", "❄️", "🏔️", "🐧", "🐻‍❄️", "🌊", "🐟", "🐳"] },
    { title: "VESMÍRNÁ VÝPRAVA", bg: "#1D3557", grid: ["🌟", "🪐", "🌙", "☄️", "🚀", "🛸", "🌍", "👨‍🚀", "⭐"] },
    { title: "ROZKVETLÁ LOUKA", bg: "#E8F8F5", grid: ["☀️", "🌈", "🦋", "🐝", "🌻", "🌷", "🐞", "🍓", "🍀"] },
    { title: "POHÁDKOVÉ KRÁLOVSTVÍ", bg: "#FFF3D6", grid: ["👑", "✨", "🐉", "🏰", "🤴", "👸", "🦄", "💎", "🛡️"] }
  ];

  class PuzzleActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.themeIdx = 0;
      this.mascot.audio.speak("act_09_intro");
      this.loadPuzzle(0);
    }

    loadPuzzle(idx) {
      this.themeIdx = idx % PUZZLE_THEMES.length;
      this.theme = PUZZLE_THEMES[this.themeIdx];
      this.count = this.level.stars === 1 ? 4 : this.level.stars === 2 ? 6 : 9;
      this.targetTiles = this.theme.grid.slice(0, this.count).map((em, i) => ({ pos: i + 1, emoji: em }));
      this.placed = new Array(this.count).fill(null);
      this.tray = [...this.targetTiles].sort(() => Math.random() - 0.5);
      this.selectedTile = this.tray[0] || null;
      this.render();
    }

    render() {
      const cols = this.count === 4 ? 2 : 3;
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🧩 PUZZLE: ${this.theme.title}</h2>
          <div class="workspace-actions">
            <span class="step-pill current">SLOŽENO: ${this.placed.filter(Boolean).length} / ${this.count}</span>
            <button id="btn-puzzle-next" class="btn-touch btn-next-task">🧩 DALŠÍ PUZZLE ➔</button>
          </div>
        </div>
        <div class="feed-layout">
          <section class="pond-panel" style="align-items:center; justify-content:center;">
            <div class="panel-heading" style="width:100%;"><span>🖼️ RÁMEČEK OBRÁZKU</span></div>
            <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:10px; width:100%; max-width:360px; flex:1; align-items:center;">
              ${this.targetTiles
                .map((t, i) => {
                  const filled = this.placed[i];
                  return `
                    <button class="target-slot ${filled ? "filled" : ""}" data-slot="${i}" style="width:100%; height:100%;">
                      <span style="font-size:clamp(1.6rem, 4dvh, 2.5rem); opacity:${filled ? "1" : "0.28"};">${t.emoji}</span>
                      <span style="font-size:0.75rem;">DÍLEK ${t.pos}</span>
                    </button>
                  `;
                })
                .join("")}
            </div>
          </section>
          <section class="bowl-panel" style="justify-content:flex-start;">
            <div class="panel-heading" style="width:100%;"><span>🧩 DÍLKY K PŘIŘAZENÍ</span></div>
            <div class="cards-grid">
              ${this.tray
                .map((t) => {
                  const isPlaced = this.placed.some((p) => p && p.pos === t.pos);
                  const isSel = this.selectedTile && this.selectedTile.pos === t.pos && !isPlaced;
                  return `
                    <button class="game-card ${isPlaced ? "matched" : isSel ? "selected" : ""}" data-piece="${t.pos}" ${isPlaced ? "disabled" : ""}>
                      <span class="game-card-emoji">${t.emoji}</span>
                      <span class="game-card-label">DÍLEK ${t.pos}</span>
                    </button>
                  `;
                })
                .join("")}
            </div>
          </section>
        </div>
      `;

      document.getElementById("btn-puzzle-next").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.loadPuzzle(this.themeIdx + 1);
      });

      this.hostEl.querySelectorAll("[data-piece]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const pos = Number(btn.dataset.piece);
          this.selectedTile = this.tray.find((x) => x.pos === pos) || null;
          this.mascot.audio.playSfx("pop");
          this.render();
        });
      });

      this.hostEl.querySelectorAll("[data-slot]").forEach((slotBtn) => {
        slotBtn.addEventListener("click", () => {
          const idx = Number(slotBtn.dataset.slot);
          if (this.placed[idx] || !this.selectedTile) return;
          if (this.selectedTile.pos === idx + 1) {
            this.placed[idx] = this.selectedTile;
            this.mascot.audio.playSfx("snap");
            this.mascot.emitParticles(["🧩", "⭐"]);
            this.selectedTile = this.tray.find((x) => !this.placed.some((p) => p && p.pos === x.pos)) || null;
            this.render();
            if (this.placed.every(Boolean)) {
              this.mascot.celebrate("celebrate_01");
              this.onComplete();
              showContinueBanner(this.hostEl, {
                title: "🧩 PUZZLE JE KOMPLETNÍ! CHCEŠ POSKLÁDAT DALŠÍ?",
                nextLabel: "🧩 DALŠÍ PUZZLE ➔",
                onNext: () => this.loadPuzzle(this.themeIdx + 1)
              });
            }
          } else {
            slotBtn.classList.add("gentle-nudge-anim");
            this.mascot.gentleNudge("hint_shape_size");
          }
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 11: SKLÁDÁNÍ PRVNÍCH SLOV ZE SLABIK ---
  const SYLLABLE_WORDS_BANK = [
    { parts: ["MÁ", "MA"], emoji: "👩" },
    { parts: ["TÁ", "TA"], emoji: "👨" },
    { parts: ["RY", "BA"], emoji: "🐟" },
    { parts: ["AU", "TO"], emoji: "🚗" },
    { parts: ["KO", "LO"], emoji: "🚲" },
    { parts: ["SO", "VA"], emoji: "🦉" },
    { parts: ["ŽÁ", "BA"], emoji: "🐸" },
    { parts: ["LIŠ", "KA"], emoji: "🦊" },
    { parts: ["BA", "NÁN"], emoji: "🍌" },
    { parts: ["JA", "HO", "DA"], emoji: "🍓" },
    { parts: ["KO", "ČIČ", "KA"], emoji: "🐱" },
    { parts: ["KO", "RU", "NA"], emoji: "👑" },
    { parts: ["RA", "KE", "TA"], emoji: "🚀" },
    { parts: ["SNĚ", "HU", "LÁK"], emoji: "⛄" }
  ];

  class SyllablesActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.wordIdx = 0;
      this.mascot.audio.speak("act_11_intro");
      this.loadWord(0);
    }

    loadWord(idx) {
      this.wordIdx = idx % SYLLABLE_WORDS_BANK.length;
      this.current = SYLLABLE_WORDS_BANK[this.wordIdx];
      this.picked = [];
      this.choices = this.current.parts
        .map((syl, i) => ({ syl, i, used: false }))
        .sort(() => Math.random() - 0.5);
      this.render();
      this.mascot.audio.renderKaraokeWords(`POSKLÁDEJ ZE SLABIK SLOVO: ${this.current.parts.join("-")}!`);
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">📖 POSKLÁDEJ SLOVO ZE SLABIK</h2>
          <div class="workspace-actions">
            <span class="step-pill current">SLOVO ${this.wordIdx + 1}</span>
            <button id="btn-syl-next" class="btn-touch btn-next-task">📖 DALŠÍ SLOVO ➔</button>
          </div>
        </div>
        <div class="interactive-stage">
          <div class="word-picture-card">
            <span class="word-emoji">${this.current.emoji}</span>
            <div class="slot-row">
              ${this.current.parts
                .map((_, i) => {
                  const val = this.picked[i] || "___";
                  return `<div class="target-slot ${this.picked[i] ? "filled" : ""}">${val}</div>`;
                })
                .join("")}
            </div>
          </div>
          <div class="letter-choices">
            ${this.choices
              .map(
                (c, idx) =>
                  `<button class="btn-touch btn-letter-choice ${c.used ? "correct" : ""}" data-cidx="${idx}" ${c.used ? "disabled" : ""}>${c.syl}</button>`
              )
              .join("")}
          </div>
        </div>
      `;

      document.getElementById("btn-syl-next").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.loadWord(this.wordIdx + 1);
      });

      this.hostEl.querySelectorAll("[data-cidx]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const item = this.choices[Number(btn.dataset.cidx)];
          const expected = this.current.parts[this.picked.length];
          if (item.syl === expected) {
            item.used = true;
            this.picked.push(item.syl);
            this.mascot.audio.playSfx("snap");
            this.render();
            if (this.picked.length === this.current.parts.length) {
              this.mascot.celebrate("celebrate_05");
              this.onComplete();
              showContinueBanner(this.hostEl, {
                title: `📖 VÝBORNĚ! PŘEČETLI JSME SLOVO ${this.current.parts.join("")}!`,
                nextLabel: "📖 DALŠÍ SLOVO ➔",
                onNext: () => this.loadWord(this.wordIdx + 1)
              });
            }
          } else {
            btn.classList.add("gentle-nudge-anim");
            this.mascot.gentleNudge("hint_letter_listen");
          }
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 12: PÍSMENKOVÁ DRÁHA (GRAFOMOTORIKA) ---
  const GLYPH_TRACKS = [
    { glyph: "A", pts: [[240, 360], [360, 80], [480, 360], [285, 250], [435, 250]] },
    { glyph: "L", pts: [[270, 80], [270, 220], [270, 360], [460, 360]] },
    { glyph: "O", pts: [[360, 80], [475, 220], [360, 360], [245, 220], [360, 80]] },
    { glyph: "M", pts: [[210, 360], [210, 85], [360, 240], [510, 85], [510, 360]] },
    { glyph: "T", pts: [[220, 90], [360, 90], [500, 90], [360, 225], [360, 365]] },
    { glyph: "E", pts: [[460, 90], [260, 90], [260, 225], [430, 225], [260, 360], [460, 360]] },
    { glyph: "S", pts: [[450, 110], [330, 85], [265, 165], [455, 275], [340, 365], [250, 330]] },
    { glyph: "Z", pts: [[240, 95], [480, 95], [360, 225], [240, 355], [480, 355]] },
    { glyph: "1", pts: [[290, 150], [375, 85], [375, 225], [375, 365]] },
    { glyph: "2", pts: [[260, 145], [365, 85], [460, 155], [255, 360], [470, 360]] },
    { glyph: "3", pts: [[265, 105], [450, 135], [345, 220], [460, 305], [265, 355]] }
  ];

  class LetterTrackActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.idx = 0;
      this.mascot.audio.speak("act_12_intro");
      this.loadGlyph(0);
    }

    loadGlyph(idx) {
      this.idx = idx % GLYPH_TRACKS.length;
      this.track = GLYPH_TRACKS[this.idx];
      this.checkpoints = this.track.pts.map(([x, y]) => ({ x, y, hit: false }));
      this.isDrawing = false;
      this.lastPt = null;
      this.done = false;
      this.render();
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🛷 PÍSMENKOVÁ DRÁHA: ZNAK „${this.track.glyph}“</h2>
          <div class="workspace-actions">
            <button id="btn-lt-clear" class="btn-touch btn-secondary">ZNOVU</button>
            <button id="btn-lt-next" class="btn-touch btn-next-task">🛷 DALŠÍ ZNAK ➔</button>
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

      document.getElementById("btn-lt-clear").addEventListener("click", () => this.loadGlyph(this.idx));
      document.getElementById("btn-lt-next").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.loadGlyph(this.idx + 1);
      });

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
        this.markHit(this.lastPt);
        this.draw();
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
        this.pCtx.lineWidth = 22;
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
        if (!this.done && this.checkpoints.every((c) => c.hit)) {
          this.done = true;
          this.mascot.celebrate("celebrate_01");
          this.onComplete();
          showContinueBanner(this.hostEl, {
            title: `🛷 ZNAK „${this.track.glyph}“ JE KRÁSNĚ OBTAŽENÝ!`,
            nextLabel: "🛷 DALŠÍ ZNAK ➔",
            onNext: () => this.loadGlyph(this.idx + 1)
          });
        }
      };
      this.canvas.addEventListener("pointerup", end);
      this.canvas.addEventListener("pointercancel", end);

      this.draw();
    }

    markHit(pt) {
      this.checkpoints.forEach((c) => {
        if (Math.hypot(c.x - pt.x, c.y - pt.y) < 48) c.hit = true;
      });
    }

    draw() {
      const ctx = this.ctx;
      ctx.fillStyle = "#F0F9FF";
      ctx.fillRect(0, 0, 720, 440);

      // Ledová dráha písmene
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

      // Kontrolní body
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

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 13: RÝMOVACÍ PEXESO ---
  const RHYME_PAIRS_POOL = [
    { pairId: 1, a: { word: "KOČKA", emoji: "🐱" }, b: { word: "VLOČKA", emoji: "❄️" } },
    { pairId: 2, a: { word: "MYŠ", emoji: "🐭" }, b: { word: "SKRÝŠ", emoji: "🏠" } },
    { pairId: 3, a: { word: "PES", emoji: "🐶" }, b: { word: "LES", emoji: "🌲" } },
    { pairId: 4, a: { word: "DRAK", emoji: "🐉" }, b: { word: "MRAK", emoji: "☁️" } },
    { pairId: 5, a: { word: "HRAD", emoji: "🏰" }, b: { word: "HAD", emoji: "🐍" } },
    { pairId: 6, a: { word: "VLK", emoji: "🐺" }, b: { word: "BRK", emoji: "🪶" } },
    { pairId: 7, a: { word: "SLON", emoji: "🐘" }, b: { word: "ZVON", emoji: "🔔" } },
    { pairId: 8, a: { word: "LIŠKA", emoji: "🦊" }, b: { word: "ŠIŠKA", emoji: "🌰" } }
  ];

  class RhymeMemoryActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.offset = 0;
      this.mascot.audio.speak("act_13_intro");
      this.startRound();
    }

    startRound() {
      const count = this.level.stars === 1 ? 3 : 4;
      const chosen = [];
      for (let i = 0; i < count; i++) {
        chosen.push(RHYME_PAIRS_POOL[(this.offset + i) % RHYME_PAIRS_POOL.length]);
      }
      this.offset += count;
      this.cards = [];
      chosen.forEach((p) => {
        this.cards.push({ id: `${p.pairId}_a`, pairId: p.pairId, ...p.a, matched: false });
        this.cards.push({ id: `${p.pairId}_b`, pairId: p.pairId, ...p.b, matched: false });
      });
      this.cards.sort(() => Math.random() - 0.5);
      this.firstCard = null;
      this.render();
    }

    render() {
      const matchedPairs = this.cards.filter((c) => c.matched).length / 2;
      const totalPairs = this.cards.length / 2;
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🎵 SPOJ DVA OBRÁZKY, KTERÉ SE RÝMUJÍ!</h2>
          <div class="workspace-actions">
            <span class="step-pill current">PÁRY: ${matchedPairs} / ${totalPairs}</span>
            <button id="btn-rhyme-next" class="btn-touch btn-next-task">🎵 DALŠÍ RÝMY ➔</button>
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
                    <span class="game-card-label">${c.word}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `;

      document.getElementById("btn-rhyme-next").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.startRound();
      });

      this.hostEl.querySelectorAll("[data-cid]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const card = this.cards.find((c) => c.id === btn.dataset.cid);
          if (!card || card.matched) return;
          this.mascot.audio.playSfx("pop");
          this.mascot.audio.renderKaraokeWords(`${card.emoji} ${card.word}!`);

          if (!this.firstCard || this.firstCard.id === card.id) {
            this.firstCard = card;
            this.render();
            return;
          }

          if (this.firstCard.pairId === card.pairId) {
            this.firstCard.matched = true;
            card.matched = true;
            this.mascot.audio.playSfx("snap");
            this.mascot.emitParticles(["🎵", "⭐"]);
            this.mascot.audio.renderKaraokeWords(`RÝM: ${this.firstCard.word} A ${card.word}!`);
            this.firstCard = null;
            this.render();
            if (this.cards.every((c) => c.matched)) {
              this.mascot.celebrate("celebrate_05");
              this.onComplete();
              showContinueBanner(this.hostEl, {
                title: "🎵 VŠECHNY RÝMY SPOJENY! CHCEŠ DALŠÍ RÝMOVÁNÍ?",
                nextLabel: "🎵 DALŠÍ RÝMY ➔",
                onNext: () => this.startRound()
              });
            }
          } else {
            this.firstCard = null;
            btn.classList.add("gentle-nudge-anim");
            this.mascot.gentleNudge("hint_letter_listen");
            setTimeout(() => this.render(), 450);
          }
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 15: LEDOVÉ VÁHY (POROVNÁVÁNÍ A VYROVNÁVÁNÍ MNOŽSTVÍ) ---
  class IceScalesActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.mascot.audio.speak("act_15_intro");
      this.nextTask();
    }

    nextTask() {
      const max = this.level.config.max || 6;
      this.leftCount = 2 + Math.floor(Math.random() * (max - 1));
      this.rightCount = Math.max(1, (this.leftCount + 2) % max);
      if (this.rightCount === this.leftCount) this.rightCount = Math.max(1, this.leftCount - 1);
      this.render();
    }

    render() {
      const diff = this.rightCount - this.leftCount;
      const tilt = Math.max(-14, Math.min(14, diff * 4));
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">⚖️ LEDOVÉ VÁHY: VYROVNEJ OBĚ MISKY NA STEJNÝ POČET!</h2>
          <div class="workspace-actions">
            <span class="step-pill current">VLEVO: ${this.leftCount} • VPRAVO: ${this.rightCount}</span>
            <button id="btn-scales-next" class="btn-touch btn-next-task">⚖️ DALŠÍ VÁŽENÍ ➔</button>
          </div>
        </div>
        <div class="interactive-stage">
          <div class="scales-stage" style="transform:rotate(${tilt}deg); transition:transform 0.35s ease;">
            <div class="scale-pan">
              <div style="width:100%; text-align:center; font-weight:900;">LEVÁ MISKA: ${this.leftCount}</div>
              ${Array.from({ length: this.leftCount }).map(() => `<span style="font-size:2rem;">🧊</span>`).join("")}
            </div>
            <div style="font-size:3rem;">⚖️</div>
            <div class="scale-pan">
              <div style="width:100%; text-align:center; font-weight:900;">PRAVÁ MISKA: ${this.rightCount}</div>
              ${Array.from({ length: this.rightCount }).map(() => `<span style="font-size:2rem;">🧊</span>`).join("")}
            </div>
          </div>
          <div style="display:flex; gap:14px; flex-wrap:wrap; justify-content:center;">
            <button id="btn-scale-rem" class="btn-touch btn-secondary">➖ ODEBRAT KOSTKU</button>
            <button id="btn-scale-add" class="btn-touch btn-primary">➕ PŘIDAT KOSTKU</button>
            <button id="btn-scale-ok" class="btn-touch btn-primary" style="background:linear-gradient(135deg,#06d6a0,#10b981);">✅ JE TO STEJNĚ!</button>
          </div>
        </div>
      `;

      document.getElementById("btn-scales-next").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.nextTask();
      });
      document.getElementById("btn-scale-rem").addEventListener("click", () => {
        if (this.rightCount > 0) this.rightCount -= 1;
        this.mascot.audio.playSfx("pop");
        this.render();
      });
      document.getElementById("btn-scale-add").addEventListener("click", () => {
        if (this.rightCount < 15) this.rightCount += 1;
        this.mascot.audio.playSfx("count");
        this.render();
      });
      document.getElementById("btn-scale-ok").addEventListener("click", () => {
        if (this.leftCount === this.rightCount) {
          this.mascot.celebrate("celebrate_01");
          this.onComplete();
          showContinueBanner(this.hostEl, {
            title: `⚖️ VÁHY JSOU V ROVNOVÁZE (${this.leftCount} = ${this.rightCount})! CHCEŠ VÁŽIT DÁL?`,
            nextLabel: "⚖️ DALŠÍ VÁŽENÍ ➔",
            onNext: () => this.nextTask()
          });
        } else {
          this.mascot.gentleNudge("hint_count_more");
        }
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 16: PRVNÍ SČÍTÁNÍ A ODČÍTÁNÍ S PŘÍBĚHEM ---
  const MATH_STORY_ITEMS = [
    { emoji: "🐧", name: "TUČŇÁKŮ" },
    { emoji: "🐟", name: "RYBIČEK" },
    { emoji: "🍎", name: "JABLÍČEK" },
    { emoji: "⭐", name: "HVĚZDIČEK" },
    { emoji: "🦋", name: "MOTÝLKŮ" }
  ];

  class StoryMathActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.mascot.audio.speak("act_16_intro");
      this.nextProblem();
    }

    nextProblem() {
      const max = this.level.config.max || 5;
      const item = MATH_STORY_ITEMS[Math.floor(Math.random() * MATH_STORY_ITEMS.length)];
      this.emoji = item.emoji;
      this.isSubtraction = this.level.stars >= 2 && Math.random() > 0.5;
      if (this.isSubtraction) {
        this.a = 3 + Math.floor(Math.random() * (max - 3));
        this.b = 1 + Math.floor(Math.random() * (this.a - 1));
        this.answer = this.a - this.b;
      } else {
        this.a = 1 + Math.floor(Math.random() * Math.max(2, Math.floor(max / 2)));
        this.b = 1 + Math.floor(Math.random() * Math.max(2, max - this.a));
        this.answer = this.a + this.b;
      }
      const opts = new Set([this.answer]);
      while (opts.size < 4) {
        opts.add(Math.max(1, this.answer + Math.floor(Math.random() * 5) - 2));
      }
      this.choices = [...opts].sort((x, y) => x - y);
      this.render();
    }

    render() {
      const sign = this.isSubtraction ? "−" : "+";
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">➕ POČÍTÁNÍ S PŘÍBĚHEM: KOLIK JE TO DOHROMADY?</h2>
          <div class="workspace-actions">
            <button id="btn-math-next" class="btn-touch btn-next-task">➕ DALŠÍ PŘÍKLAD ➔</button>
          </div>
        </div>
        <div class="interactive-stage">
          <div class="word-picture-card" style="gap:18px;">
            <div style="display:flex; gap:6px; flex-wrap:wrap; font-size:2.2rem;">
              ${Array.from({ length: this.a }).map(() => `<span>${this.emoji}</span>`).join("")}
            </div>
            <span class="word-display" style="letter-spacing:0;">${sign}</span>
            <div style="display:flex; gap:6px; flex-wrap:wrap; font-size:2.2rem;">
              ${Array.from({ length: this.b }).map(() => `<span style="${this.isSubtraction ? "opacity:0.45;" : ""}">${this.emoji}</span>`).join("")}
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

      document.getElementById("btn-math-next").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.nextProblem();
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
              title: `🎉 SPRÁVNĚ! VÝSLEDEK JE ${this.answer}! CHCEŠ DALŠÍ PŘÍKLAD?`,
              nextLabel: "➕ DALŠÍ PŘÍKLAD ➔",
              onNext: () => this.nextProblem()
            });
          } else {
            btn.classList.add("gentle-nudge-anim");
            this.mascot.gentleNudge("hint_count_more");
          }
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 17: SEŘAĎ PODLE VELIKOSTI A DÉLKY ---
  const SIZE_SORT_EMOJIS = ["🐧", "⛄", "🐟", "🌲", "⭐", "🚀", "🎈"];

  class SizeSortActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.themeIdx = 0;
      this.mascot.audio.speak("act_17_intro");
      this.nextRound();
    }

    nextRound() {
      this.emoji = SIZE_SORT_EMOJIS[this.themeIdx % SIZE_SORT_EMOJIS.length];
      this.themeIdx += 1;
      const count = Math.min(5, this.level.config.items || 3);
      this.sizes = Array.from({ length: count }, (_, i) => i + 1);
      this.pool = [...this.sizes].sort(() => Math.random() - 0.5);
      this.placed = [];
      this.render();
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">📏 SEŘAĎ OD NEJMENŠÍHO PO NEJVĚTŠÍ!</h2>
          <div class="workspace-actions">
            <span class="step-pill current">SEŘAZENO: ${this.placed.length} / ${this.sizes.length}</span>
            <button id="btn-size-next" class="btn-touch btn-next-task">📏 DALŠÍ ŘAZENÍ ➔</button>
          </div>
        </div>
        <div class="interactive-stage">
          <div class="slot-row">
            ${this.sizes
              .map((sz, i) => {
                const isDone = i < this.placed.length;
                const scale = 0.65 + sz * 0.24;
                return `
                  <div class="target-slot ${isDone ? "filled" : ""}">
                    ${isDone ? `<span style="font-size:2rem; transform:scale(${scale});">${this.emoji}</span>` : `${i + 1}.`}
                  </div>
                `;
              })
              .join("")}
          </div>
          <div class="cards-grid">
            ${this.pool
              .map((sz) => {
                const used = this.placed.includes(sz);
                const scale = 0.65 + sz * 0.24;
                return `
                  <button class="game-card ${used ? "matched" : ""}" data-sz="${sz}" ${used ? "disabled" : ""}>
                    <span class="game-card-emoji" style="transform:scale(${scale});">${this.emoji}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `;

      document.getElementById("btn-size-next").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.nextRound();
      });

      this.hostEl.querySelectorAll("[data-sz]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const pickedSz = Number(btn.dataset.sz);
          const expectedSz = this.placed.length + 1;
          if (pickedSz === expectedSz) {
            this.placed.push(pickedSz);
            this.mascot.audio.playSfx("snap");
            this.render();
            if (this.placed.length === this.sizes.length) {
              this.mascot.celebrate("celebrate_01");
              this.onComplete();
              showContinueBanner(this.hostEl, {
                title: "📏 SKVĚLE SEŘAZENO OD NEJMENŠÍHO PO NEJVĚTŠÍ!",
                nextLabel: "📏 DALŠÍ ŘAZENÍ ➔",
                onNext: () => this.nextRound()
              });
            }
          } else {
            btn.classList.add("gentle-nudge-anim");
            this.mascot.gentleNudge("hint_shape_size");
          }
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 18: DOKONČI VZOR (LOGICKÉ ŘADY) ---
  const PATTERN_SETS = [
    ["🐟", "❄️", "⭐"],
    ["🍎", "🍐", "🍌"],
    ["🌞", "🌙", "☁️"],
    ["🐧", "🦊", "🦉"],
    ["🔴", "🔵", "🟡"]
  ];

  class PatternCompleteActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.setIdx = 0;
      this.mascot.audio.speak("act_18_intro");
      this.nextPattern();
    }

    nextPattern() {
      const icons = PATTERN_SETS[this.setIdx % PATTERN_SETS.length];
      this.setIdx += 1;
      const mode = this.level.config.pattern || "ABAB";
      const [A, B, C] = icons;
      if (mode === "ABC") {
        this.seq = [A, B, C, A, B];
        this.answer = C;
      } else if (mode === "AABB") {
        this.seq = [A, A, B, B, A];
        this.answer = A;
      } else {
        this.seq = [A, B, A, B, A];
        this.answer = B;
      }
      this.choices = [A, B, C];
      this.render();
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">❄️ DOKONČI LOGICKOU ŘADU: CO PATŘÍ NA KONEC?</h2>
          <div class="workspace-actions">
            <button id="btn-pat-next" class="btn-touch btn-next-task">❄️ DALŠÍ ŘADA ➔</button>
          </div>
        </div>
        <div class="interactive-stage">
          <div class="word-picture-card">
            ${this.seq.map((em) => `<span style="font-size:clamp(2rem, 5dvh, 3.2rem);">${em}</span>`).join("")}
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

      document.getElementById("btn-pat-next").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.nextPattern();
      });

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
              title: "❄️ VZOR JE DOKONČENÝ! CHCEŠ LUŠTIT DALŠÍ ŘADU?",
              nextLabel: "❄️ DALŠÍ ŘADA ➔",
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

  // --- AKTIVITA 19: LEDOVÉ BLUDIŠTĚ ---
  const MAZE_MAPS = [
    [
      [0, 0, 1, 0, 0],
      [1, 0, 1, 0, 1],
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 0, 1, 0]
    ],
    [
      [0, 1, 0, 0, 0],
      [0, 1, 0, 1, 0],
      [0, 0, 0, 1, 0],
      [1, 1, 0, 0, 0],
      [0, 0, 0, 1, 0]
    ],
    [
      [0, 0, 0, 1, 0],
      [1, 1, 0, 1, 0],
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0]
    ]
  ];

  class IceMazeActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.mapIdx = 0;
      this.mascot.audio.speak("act_19_intro");
      this.loadMaze(0);
    }

    loadMaze(idx) {
      this.mapIdx = idx % MAZE_MAPS.length;
      this.grid = MAZE_MAPS[this.mapIdx];
      this.px = 0;
      this.py = 0;
      this.gx = 4;
      this.gy = 4;
      this.render();
    }

    move(dx, dy) {
      const nx = this.px + dx;
      const ny = this.py + dy;
      if (ny < 0 || ny >= 5 || nx < 0 || nx >= 5) return;
      if (this.grid[ny][nx] === 1) {
        this.mascot.audio.playSfx("pop");
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
          title: "🧊 PIKO DOŠEL K RYBIČCE! CHCEŠ PROJÍT DALŠÍ BLUDIŠTĚ?",
          nextLabel: "🧊 DALŠÍ BLUDIŠTĚ ➔",
          onNext: () => this.loadMaze(this.mapIdx + 1)
        });
      }
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🧊 LEDOVÉ BLUDIŠTĚ: DOVEĎ PIKA K RYBIČCE!</h2>
          <div class="workspace-actions">
            <button id="btn-maze-next" class="btn-touch btn-next-task">🧊 DALŠÍ BLUDIŠTĚ ➔</button>
          </div>
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

      document.getElementById("btn-maze-next").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.loadMaze(this.mapIdx + 1);
      });

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

  // --- AKTIVITA 20: ZVUKOVÉ A VIZUÁLNÍ PEXESO ---
  const SOUND_MEMORY_ITEMS = [
    { emoji: "🥁", label: "BUBÍNEK", freq: 180 },
    { emoji: "🎺", label: "TRUBKA", freq: 523 },
    { emoji: "🎸", label: "KYTARA", freq: 330 },
    { emoji: "🔔", label: "ZVONEČEK", freq: 880 },
    { emoji: "🎹", label: "KLAVÍR", freq: 440 },
    { emoji: "🎻", label: "HOUSLE", freq: 659 }
  ];

  class SoundMemoryActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.mascot.audio.speak("act_20_intro");
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
      const pairCount = this.level.stars === 1 ? 3 : 4;
      const items = SOUND_MEMORY_ITEMS.slice(0, pairCount);
      this.deck = [];
      items.forEach((it, idx) => {
        this.deck.push({ id: idx * 2, ...it, open: false, matched: false });
        this.deck.push({ id: idx * 2 + 1, ...it, open: false, matched: false });
      });
      this.deck.sort(() => Math.random() - 0.5);
      this.opened = [];
      this.locked = false;
      this.render();
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🥁 ZVUKOVÉ PEXESO: NAJDI STEJNÉ DVOJICE!</h2>
          <div class="workspace-actions">
            <button id="btn-smem-next" class="btn-touch btn-next-task">🥁 DALŠÍ PEXESO ➔</button>
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

      document.getElementById("btn-smem-next").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.newGame();
      });

      this.hostEl.querySelectorAll("[data-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (this.locked) return;
          const card = this.deck.find((c) => c.id === Number(btn.dataset.id));
          if (!card || card.open || card.matched) return;
          card.open = true;
          this.playTone(card.freq);
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
                  title: "🥁 VŠECHNY DVOJICE NALEZENY! CHCEŠ DALŠÍ PEXESO?",
                  nextLabel: "🥁 DALŠÍ PEXESO ➔",
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
              }, 700);
            }
          }
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 21: KÓDOVÁNÍ CESTY (PRVNÍ PROGRAMOVÁNÍ) ---
  const CODING_LEVELS = [
    { start: [0, 2], goal: [3, 2], holes: [[1, 1], [2, 3]] },
    { start: [0, 0], goal: [3, 2], holes: [[1, 0], [2, 1]] },
    { start: [0, 3], goal: [3, 0], holes: [[1, 2], [2, 2]] },
    { start: [0, 1], goal: [3, 3], holes: [[2, 1], [1, 3]] }
  ];

  class CodingPathActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.mapIdx = 0;
      this.mascot.audio.speak("act_21_intro");
      this.loadMap(0);
    }

    loadMap(idx) {
      this.mapIdx = idx % CODING_LEVELS.length;
      const m = CODING_LEVELS[this.mapIdx];
      this.px = m.start[0];
      this.py = m.start[1];
      this.gx = m.goal[0];
      this.gy = m.goal[1];
      this.holes = m.holes;
      this.commands = [];
      this.render();
    }

    runProgram() {
      if (!this.commands.length) return;
      let i = 0;
      const step = () => {
        if (i >= this.commands.length) return;
        const cmd = this.commands[i++];
        const nx = Math.max(0, Math.min(3, this.px + cmd.dx));
        const ny = Math.max(0, Math.min(3, this.py + cmd.dy));
        if (this.holes.some(([hx, hy]) => hx === nx && hy === ny)) {
          this.mascot.gentleNudge("hint_idle_encourage");
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
            title: "💎 PIKO DOŠEL K POKLADU! CHCEŠ NAPROGRAMOVAT DALŠÍ TRASU?",
            nextLabel: "🧭 DALŠÍ TRASA ➔",
            onNext: () => this.loadMap(this.mapIdx + 1)
          });
          return;
        }
        setTimeout(step, 380);
      };
      step();
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🧭 KÓDOVÁNÍ CESTY: SESTAV KROKY K POKLADU 💎</h2>
          <div class="workspace-actions">
            <button id="btn-code-clear" class="btn-touch btn-secondary">🧹 VYMAZAT KROKY</button>
            <button id="btn-code-next" class="btn-touch btn-next-task">🧭 DALŠÍ TRASA ➔</button>
          </div>
        </div>
        <div class="feed-layout">
          <div style="display:flex; align-items:center; justify-content:center; min-height:0;">
            <div class="grid-board" style="grid-template-columns:repeat(4, 1fr);">
              ${Array.from({ length: 16 })
                .map((_, idx) => {
                  const x = idx % 4;
                  const y = Math.floor(idx / 4);
                  const isPiko = x === this.px && y === this.py;
                  const isGoal = x === this.gx && y === this.gy;
                  const isHole = this.holes.some(([hx, hy]) => hx === x && hy === y);
                  return `<div class="grid-cell ${isGoal ? "goal" : isHole ? "wall" : ""}">${isPiko ? "🐧" : isGoal ? "💎" : isHole ? "🕳️" : ""}</div>`;
                })
                .join("")}
            </div>
          </div>
          <div class="bowl-panel" style="justify-content:space-between;">
            <div class="panel-heading">1. PŘIDEJ ŠIPKY DO PROGRAMU:</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
              <button class="btn-touch btn-secondary" data-cmd="0,-1,⬆️">⬆️ NAHORU</button>
              <button class="btn-touch btn-secondary" data-cmd="0,1,⬇️">⬇️ DOLŮ</button>
              <button class="btn-touch btn-secondary" data-cmd="-1,0,⬅️">⬅️ VLEVO</button>
              <button class="btn-touch btn-secondary" data-cmd="1,0,➡️">➡️ VPRAVO</button>
            </div>
            <div class="bowl-dropzone" style="min-height:54px;">
              ${this.commands.length ? this.commands.map((c) => `<span style="font-size:1.6rem;">${c.icon}</span>`).join(" ") : "ZATÍM ŽÁDNÉ KROKY"}
            </div>
            <button id="btn-code-run" class="btn-touch btn-feed-submit">▶ SPUSTIT KÓD</button>
          </div>
        </div>
      `;

      document.getElementById("btn-code-clear").addEventListener("click", () => this.loadMap(this.mapIdx));
      document.getElementById("btn-code-next").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.loadMap(this.mapIdx + 1);
      });
      document.getElementById("btn-code-run").addEventListener("click", () => this.runProgram());

      this.hostEl.querySelectorAll("[data-cmd]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const [dx, dy, icon] = btn.dataset.cmd.split(",");
          this.commands.push({ dx: Number(dx), dy: Number(dy), icon });
          this.mascot.audio.playSfx("pop");
          this.render();
        });
      });
    }

    destroy() {
      this.mascot.clearInactivityTimer();
    }
  }

  // --- AKTIVITA 22: TŘÍDĚNÍ PODLE VÍCE VLASTNOSTÍ (MATICE) ---
  const MATRIX_SETS = [
    {
      rows: [
        { id: "fish", label: "🐟 RYBKA", emoji: "🐟" },
        { id: "star", label: "⭐ HVĚZDA", emoji: "⭐" }
      ],
      cols: [
        { id: "red", label: "🔴 ČERVENÁ", bg: "#FFE5EC" },
        { id: "blue", label: "🔵 MODRÁ", bg: "#E2F0FF" }
      ]
    },
    {
      rows: [
        { id: "car", label: "🚗 AUTO", emoji: "🚗" },
        { id: "balloon", label: "🎈 BALÓNEK", emoji: "🎈" }
      ],
      cols: [
        { id: "yellow", label: "🟡 ŽLUTÁ", bg: "#FFF9DB" },
        { id: "green", label: "🟢 ZELENÁ", bg: "#E6FCF5" }
      ]
    }
  ];

  class MatrixSortActivity {
    constructor(hostEl, activity, level, mascot, store, onComplete) {
      this.hostEl = hostEl;
      this.level = level;
      this.mascot = mascot;
      this.onComplete = onComplete;
      this.setIdx = 0;
      this.mascot.audio.speak("act_22_intro");
      this.loadSet(0);
    }

    loadSet(idx) {
      this.setIdx = idx % MATRIX_SETS.length;
      const cfg = MATRIX_SETS[this.setIdx];
      this.rows = cfg.rows;
      this.cols = cfg.cols;
      this.filled = {};
      this.items = [];
      this.rows.forEach((r) => {
        this.cols.forEach((c) => {
          this.items.push({ key: `${r.id}_${c.id}`, emoji: r.emoji, bg: c.bg, label: `${c.label.split(" ")[1]} ${r.label.split(" ")[1]}` });
        });
      });
      this.selectedKey = this.items[0].key;
      this.render();
    }

    render() {
      this.hostEl.innerHTML = `
        <div class="workspace-header">
          <h2 class="workspace-title">🗂️ ZAŘAĎ KARTIČKY DO SPRÁVNÉHO ŘÁDKU A SLOUPCE!</h2>
          <div class="workspace-actions">
            <button id="btn-mat-next" class="btn-touch btn-next-task">🗂️ DALŠÍ TABULKA ➔</button>
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
            <div class="panel-heading">VYBER KARTIČKU A ŤUKNI DO TABULKY:</div>
            <div class="cards-grid">
              ${this.items
                .map((it) => {
                  const done = this.filled[it.key];
                  const sel = this.selectedKey === it.key && !done;
                  return `
                    <button class="game-card ${done ? "matched" : sel ? "selected" : ""}" data-item="${it.key}" style="background:${it.bg};" ${done ? "disabled" : ""}>
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

      document.getElementById("btn-mat-next").addEventListener("click", () => {
        this.mascot.audio.playSfx("pop");
        this.loadSet(this.setIdx + 1);
      });

      this.hostEl.querySelectorAll("[data-item]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.selectedKey = btn.dataset.item;
          this.mascot.audio.playSfx("pop");
          this.render();
        });
      });

      this.hostEl.querySelectorAll("[data-cell]").forEach((cell) => {
        cell.addEventListener("click", () => {
          const key = cell.dataset.cell;
          if (this.filled[key]) return;
          if (this.selectedKey === key) {
            this.filled[key] = true;
            this.mascot.audio.playSfx("snap");
            const next = this.items.find((x) => !this.filled[x.key]);
            this.selectedKey = next ? next.key : null;
            this.render();
            if (Object.keys(this.filled).length === this.items.length) {
              this.mascot.celebrate("celebrate_02");
              this.onComplete();
              showContinueBanner(this.hostEl, {
                title: "🗂️ CELÁ TABULKA JE SPRÁVNĚ VYPLNĚNÁ!",
                nextLabel: "🗂️ DALŠÍ TABULKA ➔",
                onNext: () => this.loadSet(this.setIdx + 1)
              });
            }
          } else {
            cell.classList.add("gentle-nudge-anim");
            this.mascot.gentleNudge("hint_shape_size");
          }
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

    openMathGate() {
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

      document.getElementById("btn-bedtime-parent-unlock").addEventListener("click", () => {
        this.bedtimeOverlay.classList.add("hidden");
        this.mascot.setState("IDLE");
        this.remainingSec = (this.store.state.settings.limitMinutes || 30) * 60;
        this.updateTimerBadge();
        this.audio.speak("intro_welcome");
      });

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
                <span>⭐ ${stars} / ${zoneActs.length * 3} • cca ${mins} min hraní</span>
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
                <div>
                  <div class="activity-row-title">${act.title.toUpperCase()}</div>
                </div>
              </div>
              <div class="activity-row-actions">
                ${
                  act.implementedInPrototype
                    ? `<button class="btn-touch btn-primary btn-launch-act" data-act-id="${act.id}">▶ HRÁT ${starBadge}</button>`
                    : `<button class="btn-touch btn-secondary btn-preview-act" data-act-id="${act.id}">🔊 POSLECHNOUT</button>`
                }
              </div>
            </div>
          `;
        })
        .join("");

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
      const level = activity.levels.find((l) => l.stars === stars) || activity.levels[0];

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
        symmetry_draw: SymmetryDrawActivity,
        story_draw: StoryDrawActivity,
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
          fetch("./data/activities.json?v=6"),
          fetch("./data/audio_manifest.json?v=6")
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
              keys.filter((k) => k !== "tucnakuv-svet-v6").map((k) => caches.delete(k))
            )
          )
          .catch(() => {});
      }

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .register("./sw.js?v=6")
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
