/* Auto-bundled offline fallback data synchronized with data/activities.json and data/audio_manifest.json */
window.PENGUIN_WORLD_DATA = {
  activitiesCatalog: {
  "version": "1.0.0",
  "locale": "cs-CZ",
  "zones": [
    {
      "id": "zone_a",
      "title": "Umělecký ateliér",
      "subtitle": "Kreslení, míchání barev a tvoření",
      "themeColor": "#FFE5EC",
      "accentColor": "#FF5D8F",
      "icon": "🎨",
      "audioIntroId": "zone_a_intro",
      "position": {
        "x": 18,
        "y": 32
      }
    },
    {
      "id": "zone_b",
      "title": "Svět tvarů a prostoru",
      "subtitle": "Tangramy, stíny a puzzle",
      "themeColor": "#E3F6F5",
      "accentColor": "#00A896",
      "icon": "🔺",
      "audioIntroId": "zone_b_intro",
      "position": {
        "x": 49,
        "y": 24
      }
    },
    {
      "id": "zone_c",
      "title": "První krůčky ke čtení",
      "subtitle": "Písmenka, slabiky a rýmy",
      "themeColor": "#FFF3D6",
      "accentColor": "#F77F00",
      "icon": "🔤",
      "audioIntroId": "zone_c_intro",
      "position": {
        "x": 80,
        "y": 33
      }
    },
    {
      "id": "zone_d",
      "title": "Hravá matematika",
      "subtitle": "Počítání rybiček a ledové váhy",
      "themeColor": "#E2F0FF",
      "accentColor": "#277DA1",
      "icon": "🐟",
      "audioIntroId": "zone_d_intro",
      "position": {
        "x": 34,
        "y": 68
      }
    },
    {
      "id": "zone_e",
      "title": "Logika, paměť a postřeh",
      "subtitle": "Bludiště, pexeso a kódování",
      "themeColor": "#EFE5FF",
      "accentColor": "#7209B7",
      "icon": "🧭",
      "audioIntroId": "zone_e_intro",
      "position": {
        "x": 68,
        "y": 68
      }
    }
  ],
  "activities": [
    {
      "id": "act_01_step_draw",
      "number": 1,
      "zoneId": "zone_a",
      "title": "Kreslení krok za krokem",
      "shortTitle": "Kreslení krok za krokem",
      "icon": "✏️",
      "type": "step_draw",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Rozvoj jemné motoriky, grafomotoriky, vnímání tvarů a kreativity s oživením kresby.",
      "audioIntroId": "act_01_intro",
      "levels": [
        {
          "stars": 1,
          "label": "Veselý tučňák",
          "config": {
            "templateId": "penguin",
            "title": "VESELÝ TUČŇÁK",
            "canvasWidth": 720,
            "canvasHeight": 460,
            "steps": [
              {
                "id": "body",
                "label": "Tělíčko (velký ovál)",
                "audioId": "draw_step_oval",
                "type": "ellipse",
                "cx": 360,
                "cy": 295,
                "rx": 105,
                "ry": 120,
                "strokeColor": "#1D3557",
                "fillColor": "#2B2D42"
              },
              {
                "id": "head",
                "label": "Hlavička",
                "audioId": "draw_step_head",
                "type": "circle",
                "cx": 360,
                "cy": 145,
                "r": 72,
                "strokeColor": "#1D3557",
                "fillColor": "#2B2D42"
              },
              {
                "id": "wings",
                "label": "Křidélka po stranách",
                "audioId": "draw_step_wings",
                "type": "arcs",
                "paths": [
                  [
                    [
                      262,
                      235
                    ],
                    [
                      198,
                      290
                    ],
                    [
                      236,
                      355
                    ],
                    [
                      268,
                      320
                    ]
                  ],
                  [
                    [
                      458,
                      235
                    ],
                    [
                      522,
                      290
                    ],
                    [
                      484,
                      355
                    ],
                    [
                      452,
                      320
                    ]
                  ]
                ],
                "strokeColor": "#1D3557",
                "fillColor": "#2B2D42"
              },
              {
                "id": "face",
                "label": "Očíčka a zobáček",
                "audioId": "draw_step_face",
                "type": "details",
                "paths": [
                  [
                    [
                      332,
                      130
                    ],
                    [
                      338,
                      130
                    ]
                  ],
                  [
                    [
                      388,
                      130
                    ],
                    [
                      394,
                      130
                    ]
                  ],
                  [
                    [
                      344,
                      158
                    ],
                    [
                      360,
                      184
                    ],
                    [
                      376,
                      158
                    ],
                    [
                      344,
                      158
                    ]
                  ]
                ],
                "strokeColor": "#F77F00",
                "fillColor": "#FFB703"
              }
            ]
          },
          "hintAudioIds": [
            "hint_draw_trace"
          ],
          "successAudioId": "draw_step_alive"
        },
        {
          "stars": 2,
          "label": "Roztomilá kočička",
          "config": {
            "templateId": "cat",
            "title": "ROZTOMILÁ KOČIČKA",
            "canvasWidth": 720,
            "canvasHeight": 460,
            "steps": [
              {
                "id": "body",
                "label": "Tělíčko",
                "audioId": "draw_step_oval",
                "type": "ellipse",
                "cx": 360,
                "cy": 310,
                "rx": 92,
                "ry": 102,
                "strokeColor": "#1D3557",
                "fillColor": "#FFD166"
              },
              {
                "id": "head",
                "label": "Hlavička",
                "audioId": "draw_step_head",
                "type": "circle",
                "cx": 360,
                "cy": 165,
                "r": 74,
                "strokeColor": "#1D3557",
                "fillColor": "#FFD166"
              },
              {
                "id": "ears",
                "label": "Ouška a fousky",
                "audioId": "draw_step_ears",
                "type": "arcs",
                "paths": [
                  [
                    [
                      298,
                      122
                    ],
                    [
                      295,
                      58
                    ],
                    [
                      338,
                      98
                    ]
                  ],
                  [
                    [
                      422,
                      122
                    ],
                    [
                      425,
                      58
                    ],
                    [
                      382,
                      98
                    ]
                  ],
                  [
                    [
                      448,
                      355
                    ],
                    [
                      535,
                      315
                    ],
                    [
                      515,
                      250
                    ]
                  ]
                ],
                "strokeColor": "#1D3557",
                "fillColor": "#F4A261"
              },
              {
                "id": "face",
                "label": "Čumáček a oči",
                "audioId": "draw_step_face",
                "type": "details",
                "paths": [
                  [
                    [
                      332,
                      152
                    ],
                    [
                      336,
                      152
                    ]
                  ],
                  [
                    [
                      388,
                      152
                    ],
                    [
                      392,
                      152
                    ]
                  ],
                  [
                    [
                      348,
                      175
                    ],
                    [
                      360,
                      190
                    ],
                    [
                      372,
                      175
                    ],
                    [
                      348,
                      175
                    ]
                  ]
                ],
                "strokeColor": "#E76F51",
                "fillColor": "#FF5D8F"
              }
            ]
          },
          "hintAudioIds": [
            "hint_draw_trace"
          ],
          "successAudioId": "draw_step_alive"
        },
        {
          "stars": 3,
          "label": "Vesmírná raketa",
          "config": {
            "templateId": "rocket",
            "title": "VESMÍRNÁ RAKETA",
            "canvasWidth": 720,
            "canvasHeight": 460,
            "steps": [
              {
                "id": "hull",
                "label": "Trup rakety",
                "audioId": "draw_step_rocket_body",
                "type": "ellipse",
                "cx": 360,
                "cy": 255,
                "rx": 78,
                "ry": 135,
                "strokeColor": "#1D3557",
                "fillColor": "#F1FAEE"
              },
              {
                "id": "nose_fins",
                "label": "Špička a křidélka",
                "audioId": "draw_step_rocket_nose",
                "type": "arcs",
                "paths": [
                  [
                    [
                      298,
                      155
                    ],
                    [
                      360,
                      58
                    ],
                    [
                      422,
                      155
                    ]
                  ],
                  [
                    [
                      286,
                      310
                    ],
                    [
                      218,
                      392
                    ],
                    [
                      304,
                      372
                    ]
                  ],
                  [
                    [
                      434,
                      310
                    ],
                    [
                      502,
                      392
                    ],
                    [
                      416,
                      372
                    ]
                  ]
                ],
                "strokeColor": "#1D3557",
                "fillColor": "#E63946"
              },
              {
                "id": "window",
                "label": "Kulaté okénko",
                "audioId": "draw_step_head",
                "type": "circle",
                "cx": 360,
                "cy": 225,
                "r": 40,
                "strokeColor": "#1D3557",
                "fillColor": "#4CC9F0"
              }
            ]
          },
          "hintAudioIds": [
            "hint_draw_trace"
          ],
          "successAudioId": "draw_step_alive"
        }
      ]
    },
    {
      "id": "act_02_color_mix",
      "number": 2,
      "zoneId": "zone_a",
      "title": "Kouzelné omalovánky s mícháním barev",
      "shortTitle": "Míchání barev",
      "icon": "🖌️",
      "type": "color_mix",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Experimentování se základními a doplňkovými barvami a rozvoj estetického cítění (integrovaná paleta i v Aktivitě 1).",
      "audioIntroId": "act_02_intro",
      "levels": [
        {
          "stars": 1,
          "label": "Základní míchání (žlutá + modrá)",
          "config": {
            "pairs": [
              [
                "yellow",
                "blue"
              ]
            ]
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_04"
        },
        {
          "stars": 2,
          "label": "Tři kouzelné směsi",
          "config": {
            "pairs": [
              [
                "yellow",
                "blue"
              ],
              [
                "red",
                "yellow"
              ],
              [
                "red",
                "blue"
              ]
            ]
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_04"
        },
        {
          "stars": 3,
          "label": "Velká paleta umělce",
          "config": {
            "pairs": [
              [
                "yellow",
                "blue"
              ],
              [
                "red",
                "yellow"
              ],
              [
                "red",
                "blue"
              ]
            ]
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_04"
        }
      ]
    },
    {
      "id": "act_03_symmetry",
      "number": 3,
      "zoneId": "zone_a",
      "title": "Zrcadlové kreslení (Symetrie)",
      "shortTitle": "Zrcadlové kreslení",
      "icon": "🦋",
      "type": "symmetry_draw",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Pochopení osové souměrnosti, koordinace ruka-oko a tvořivá radost z mandal.",
      "audioIntroId": "act_03_intro",
      "levels": [
        {
          "stars": 1,
          "label": "Motýlek",
          "config": {
            "motif": "butterfly",
            "title": "DOKRESLI MOTÝLKA",
            "autoMirror": true
          },
          "hintAudioIds": [
            "hint_draw_trace"
          ],
          "successAudioId": "symmetry_done"
        },
        {
          "stars": 2,
          "label": "Sněhová vločka",
          "config": {
            "motif": "snowflake",
            "title": "LEDOVÁ VLOČKA",
            "autoMirror": true
          },
          "hintAudioIds": [
            "hint_draw_trace"
          ],
          "successAudioId": "symmetry_done"
        },
        {
          "stars": 3,
          "label": "Královská koruna",
          "config": {
            "motif": "crown",
            "title": "ZRCADLOVÁ KORUNA",
            "autoMirror": false
          },
          "hintAudioIds": [
            "hint_draw_trace"
          ],
          "successAudioId": "symmetry_done"
        }
      ]
    },
    {
      "id": "act_04_story_draw",
      "number": 4,
      "zoneId": "zone_a",
      "title": "Dokresli příběh",
      "shortTitle": "Dokresli příběh",
      "icon": "☔",
      "type": "story_draw",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Rozvoj fantazie, logiky děje a výtvarného vyjadřování.",
      "audioIntroId": "act_04_intro",
      "levels": [
        {
          "stars": 1,
          "label": "Deštník pro tučňáka",
          "config": {
            "scene": "rain"
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_04"
        },
        {
          "stars": 2,
          "label": "Kola pro autíčko",
          "config": {
            "scene": "car"
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_04"
        },
        {
          "stars": 3,
          "label": "Křídla pro draka",
          "config": {
            "scene": "dragon"
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_04"
        }
      ]
    },
    {
      "id": "act_05_connect_dots",
      "number": 5,
      "zoneId": "zone_a",
      "title": "Spojovačky s odhalením",
      "shortTitle": "Spojovačky",
      "icon": "✨",
      "type": "connect_dots",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Řazení čísel a písmen, přesnost tahu tužkou či prstem.",
      "audioIntroId": "act_05_intro",
      "levels": [
        {
          "stars": 1,
          "label": "Čísla 1–8",
          "config": {
            "count": 8
          },
          "hintAudioIds": [
            "hint_draw_trace"
          ],
          "successAudioId": "celebrate_01"
        },
        {
          "stars": 2,
          "label": "Čísla 1–15",
          "config": {
            "count": 15
          },
          "hintAudioIds": [
            "hint_draw_trace"
          ],
          "successAudioId": "celebrate_01"
        },
        {
          "stars": 3,
          "label": "Abeceda A–L",
          "config": {
            "letters": 12
          },
          "hintAudioIds": [
            "hint_draw_trace"
          ],
          "successAudioId": "celebrate_01"
        }
      ]
    },
    {
      "id": "act_06_tangram",
      "number": 6,
      "zoneId": "zone_b",
      "title": "Stavitel z tvarů (Tangram)",
      "shortTitle": "Stavitel z tvarů",
      "icon": "🔷",
      "type": "tangram",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Prostorová představivost, poznávání geometrických útvarů a mentální rotace.",
      "audioIntroId": "act_06_intro",
      "levels": [
        {
          "stars": 1,
          "label": "Polární domeček (3 dílky)",
          "config": {
            "title": "POSKLÁDEJ DOMEČEK",
            "snapTolerance": 34,
            "allowRotation": false,
            "pieces": [
              {
                "id": "roof",
                "shape": "triangle",
                "color": "#FF595E",
                "size": 120,
                "targetX": 260,
                "targetY": 110,
                "targetRot": 0,
                "startX": 540,
                "startY": 95,
                "startRot": 0,
                "label": "Střecha"
              },
              {
                "id": "wall",
                "shape": "square",
                "color": "#FFCA3A",
                "size": 120,
                "targetX": 260,
                "targetY": 230,
                "targetRot": 0,
                "startX": 540,
                "startY": 230,
                "startRot": 0,
                "label": "Stěna"
              },
              {
                "id": "sun",
                "shape": "circle",
                "color": "#4CC9F0",
                "size": 68,
                "targetX": 115,
                "targetY": 90,
                "targetRot": 0,
                "startX": 555,
                "startY": 355,
                "startRot": 0,
                "label": "Sluníčko"
              }
            ]
          },
          "hintAudioIds": [
            "hint_shape_corners",
            "hint_shape_size"
          ],
          "successAudioId": "celebrate_01"
        },
        {
          "stars": 2,
          "label": "Rychlá raketa (5 dílků)",
          "config": {
            "title": "POSKLÁDEJ RAKETU",
            "snapTolerance": 32,
            "allowRotation": true,
            "pieces": [
              {
                "id": "nose",
                "shape": "triangle",
                "color": "#FF595E",
                "size": 100,
                "targetX": 250,
                "targetY": 72,
                "targetRot": 0,
                "startX": 540,
                "startY": 65,
                "startRot": 90,
                "label": "Špička"
              },
              {
                "id": "body1",
                "shape": "square",
                "color": "#4CC9F0",
                "size": 100,
                "targetX": 250,
                "targetY": 172,
                "targetRot": 0,
                "startX": 540,
                "startY": 165,
                "startRot": 0,
                "label": "Trup"
              },
              {
                "id": "body2",
                "shape": "square",
                "color": "#8AC926",
                "size": 100,
                "targetX": 250,
                "targetY": 272,
                "targetRot": 0,
                "startX": 540,
                "startY": 268,
                "startRot": 0,
                "label": "Motor"
              },
              {
                "id": "fin_l",
                "shape": "right_triangle",
                "color": "#FFCA3A",
                "size": 76,
                "targetX": 174,
                "targetY": 296,
                "targetRot": 0,
                "startX": 468,
                "startY": 360,
                "startRot": 0,
                "label": "Levé křídlo"
              },
              {
                "id": "fin_r",
                "shape": "right_triangle",
                "color": "#FFCA3A",
                "size": 76,
                "targetX": 350,
                "targetY": 296,
                "targetRot": 90,
                "startX": 585,
                "startY": 360,
                "startRot": 0,
                "label": "Pravé křídlo"
              }
            ]
          },
          "hintAudioIds": [
            "hint_shape_rotate",
            "hint_shape_corners"
          ],
          "successAudioId": "celebrate_02"
        },
        {
          "stars": 3,
          "label": "Plachetnice na moři (6 dílků s otáčením)",
          "config": {
            "title": "POSKLÁDEJ PLACHETNICI",
            "snapTolerance": 30,
            "allowRotation": true,
            "pieces": [
              {
                "id": "sail_big",
                "shape": "right_triangle",
                "color": "#FF595E",
                "size": 115,
                "targetX": 240,
                "targetY": 110,
                "targetRot": 0,
                "startX": 530,
                "startY": 55,
                "startRot": 180,
                "label": "Hlavní plachta"
              },
              {
                "id": "sail_small",
                "shape": "right_triangle",
                "color": "#FFCA3A",
                "size": 86,
                "targetX": 150,
                "targetY": 139,
                "targetRot": 90,
                "startX": 545,
                "startY": 165,
                "startRot": 0,
                "label": "Malá plachta"
              },
              {
                "id": "hull_mid",
                "shape": "square",
                "color": "#1982C4",
                "size": 88,
                "targetX": 215,
                "targetY": 245,
                "targetRot": 0,
                "startX": 465,
                "startY": 265,
                "startRot": 0,
                "label": "Paluba"
              },
              {
                "id": "hull_l",
                "shape": "right_triangle",
                "color": "#6A4C93",
                "size": 88,
                "targetX": 127,
                "targetY": 245,
                "targetRot": 180,
                "startX": 585,
                "startY": 265,
                "startRot": 90,
                "label": "Příď"
              },
              {
                "id": "hull_r",
                "shape": "right_triangle",
                "color": "#6A4C93",
                "size": 88,
                "targetX": 303,
                "targetY": 245,
                "targetRot": 270,
                "startX": 465,
                "startY": 365,
                "startRot": 0,
                "label": "Záď"
              },
              {
                "id": "sun",
                "shape": "circle",
                "color": "#FFB703",
                "size": 62,
                "targetX": 78,
                "targetY": 62,
                "targetRot": 0,
                "startX": 585,
                "startY": 368,
                "startRot": 0,
                "label": "Sluníčko"
              }
            ]
          },
          "hintAudioIds": [
            "hint_shape_rotate",
            "hint_shape_corners"
          ],
          "successAudioId": "celebrate_01"
        }
      ]
    },
    {
      "id": "act_07_shadow_match",
      "number": 7,
      "zoneId": "zone_b",
      "title": "Hledač stínů a siluet",
      "shortTitle": "Hledač stínů",
      "icon": "🌗",
      "type": "shadow_match",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Vizuální diferenciace figura-pozadí a vnímání tvarových detailů.",
      "audioIntroId": "act_07_intro",
      "levels": [
        {
          "stars": 1,
          "label": "3 zvířátka",
          "config": {
            "pairs": 3
          },
          "hintAudioIds": [
            "hint_shape_size"
          ],
          "successAudioId": "celebrate_02"
        },
        {
          "stars": 2,
          "label": "5 objektů",
          "config": {
            "pairs": 5
          },
          "hintAudioIds": [
            "hint_shape_size"
          ],
          "successAudioId": "celebrate_02"
        },
        {
          "stars": 3,
          "label": "Pootočené siluety",
          "config": {
            "pairs": 6,
            "rotated": true
          },
          "hintAudioIds": [
            "hint_shape_rotate"
          ],
          "successAudioId": "celebrate_02"
        }
      ]
    },
    {
      "id": "act_08_visual_detective",
      "number": 8,
      "zoneId": "zone_b",
      "title": "Co do obrázku nepatří?",
      "shortTitle": "Vizuální detektiv",
      "icon": "🔍",
      "type": "visual_detective",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Postřeh, logické vyhodnocení kontextu a slovní zdůvodnění.",
      "audioIntroId": "act_08_intro",
      "levels": [
        {
          "stars": 1,
          "label": "3 nesmysly",
          "config": {
            "anomalies": 3
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_02"
        },
        {
          "stars": 2,
          "label": "5 nesmyslů",
          "config": {
            "anomalies": 5
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_02"
        },
        {
          "stars": 3,
          "label": "7 skrytých detailů",
          "config": {
            "anomalies": 7
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_02"
        }
      ]
    },
    {
      "id": "act_09_puzzle",
      "number": 9,
      "zoneId": "zone_b",
      "title": "Skládání rozstříhaných obrázků",
      "shortTitle": "Ledové puzzle",
      "icon": "🧩",
      "type": "puzzle",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Analýza a syntéza celku z částí, trpělivost.",
      "audioIntroId": "act_09_intro",
      "levels": [
        {
          "stars": 1,
          "label": "6 dílků",
          "config": {
            "pieces": 6
          },
          "hintAudioIds": [
            "hint_shape_size"
          ],
          "successAudioId": "celebrate_01"
        },
        {
          "stars": 2,
          "label": "12 dílků",
          "config": {
            "pieces": 12
          },
          "hintAudioIds": [
            "hint_shape_size"
          ],
          "successAudioId": "celebrate_01"
        },
        {
          "stars": 3,
          "label": "20 dílků",
          "config": {
            "pieces": 20
          },
          "hintAudioIds": [
            "hint_shape_size"
          ],
          "successAudioId": "celebrate_01"
        }
      ]
    },
    {
      "id": "act_10_first_letter",
      "number": 10,
      "zoneId": "zone_c",
      "title": "Na jaké písmeno to začíná?",
      "shortTitle": "První písmeno",
      "icon": "🦊",
      "type": "first_letter",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Fonematický sluch, izolace první hlásky a propojení se znakem velkého tiskacího písmena.",
      "audioIntroId": "act_10_intro",
      "levels": [
        {
          "stars": 1,
          "label": "Lehká slovíčka (3 volby)",
          "config": {
            "rounds": [
              {
                "word": "LIŠKA",
                "audioId": "word_liska",
                "spoken": "L-L-LIŠKA! Na jaké písmeno začíná slovo LIŠKA?",
                "emoji": "🦊",
                "answer": "L",
                "choices": [
                  "L",
                  "M",
                  "S"
                ]
              },
              {
                "word": "RYBA",
                "audioId": "word_ryba",
                "spoken": "R-R-RYBA! Na jaké písmeno začíná slovo RYBA?",
                "emoji": "🐟",
                "answer": "R",
                "choices": [
                  "K",
                  "R",
                  "T"
                ]
              },
              {
                "word": "AUTO",
                "audioId": "word_auto",
                "spoken": "A-A-AUTO! Na jaké písmeno začíná slovo AUTO?",
                "emoji": "🚗",
                "answer": "A",
                "choices": [
                  "O",
                  "E",
                  "A"
                ]
              }
            ]
          },
          "hintAudioIds": [
            "hint_letter_listen"
          ],
          "successAudioId": "celebrate_05"
        },
        {
          "stars": 2,
          "label": "Zvířátka a příroda (4 volby)",
          "config": {
            "rounds": [
              {
                "word": "KOČKA",
                "audioId": "word_kocka",
                "spoken": "K-K-KOČKA! Na jaké písmeno začíná slovo KOČKA?",
                "emoji": "🐱",
                "answer": "K",
                "choices": [
                  "K",
                  "P",
                  "B",
                  "T"
                ]
              },
              {
                "word": "SLUNCE",
                "audioId": "word_slunce",
                "spoken": "S-S-SLUNCE! Na jaké písmeno začíná slovo SLUNCE?",
                "emoji": "☀️",
                "answer": "S",
                "choices": [
                  "Z",
                  "S",
                  "C",
                  "L"
                ]
              },
              {
                "word": "MOTÝL",
                "audioId": "word_motyl",
                "spoken": "M-M-MOTÝL! Na jaké písmeno začíná slovo MOTÝL?",
                "emoji": "🦋",
                "answer": "M",
                "choices": [
                  "N",
                  "V",
                  "M",
                  "H"
                ]
              }
            ]
          },
          "hintAudioIds": [
            "hint_letter_listen"
          ],
          "successAudioId": "celebrate_05"
        },
        {
          "stars": 3,
          "label": "Výzva s diakritikou (4 volby)",
          "config": {
            "rounds": [
              {
                "word": "TUČŇÁK",
                "audioId": "word_tucnak",
                "spoken": "T-T-TUČŇÁK! Na jaké písmeno začíná slovo TUČŇÁK?",
                "emoji": "🐧",
                "answer": "T",
                "choices": [
                  "D",
                  "T",
                  "P",
                  "K"
                ]
              },
              {
                "word": "ŽÁBA",
                "audioId": "word_zaba",
                "spoken": "Ž-Ž-ŽÁBA! Na jaké písmeno začíná slovo ŽÁBA?",
                "emoji": "🐸",
                "answer": "Ž",
                "choices": [
                  "Z",
                  "Š",
                  "Ž",
                  "Č"
                ]
              },
              {
                "word": "ŠNEK",
                "audioId": "word_snek",
                "spoken": "Š-Š-ŠNEK! Na jaké písmeno začíná slovo ŠNEK?",
                "emoji": "🐌",
                "answer": "Š",
                "choices": [
                  "S",
                  "Š",
                  "Ž",
                  "C"
                ]
              }
            ]
          },
          "hintAudioIds": [
            "hint_letter_listen"
          ],
          "successAudioId": "celebrate_05"
        }
      ]
    },
    {
      "id": "act_11_syllables",
      "number": 11,
      "zoneId": "zone_c",
      "title": "Skládání prvních slov ze slabik",
      "shortTitle": "Slova ze slabik",
      "icon": "📖",
      "type": "syllables",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Analýza a syntéza slabik (MA-MA, AU-TO, RY-BA) pro plynulé počáteční čtení.",
      "audioIntroId": "act_11_intro",
      "levels": [
        {
          "stars": 1,
          "label": "Dvouslabičná otevřená slova",
          "config": {
            "words": [
              "MA-MA",
              "TA-TA",
              "RY-BA"
            ]
          },
          "hintAudioIds": [
            "hint_letter_listen"
          ],
          "successAudioId": "celebrate_05"
        },
        {
          "stars": 2,
          "label": "Dvouslabičná pestrá",
          "config": {
            "words": [
              "AU-TO",
              "KO-LO",
              "SO-VA"
            ]
          },
          "hintAudioIds": [
            "hint_letter_listen"
          ],
          "successAudioId": "celebrate_05"
        },
        {
          "stars": 3,
          "label": "Tříslabičná slova",
          "config": {
            "words": [
              "BA-NÁN",
              "JA-HO-DA",
              "KO-ČIČ-KA"
            ]
          },
          "hintAudioIds": [
            "hint_letter_listen"
          ],
          "successAudioId": "celebrate_05"
        }
      ]
    },
    {
      "id": "act_12_letter_track",
      "number": 12,
      "zoneId": "zone_c",
      "title": "Písmenková dráha (Grafomotorika)",
      "shortTitle": "Písmenková dráha",
      "icon": "🛷",
      "type": "letter_track",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Osvojení správného směru tahu velkých tiskacích písmen a číslic.",
      "audioIntroId": "act_12_intro",
      "levels": [
        {
          "stars": 1,
          "label": "Jednoduchá písmena (I, L, O, A)",
          "config": {
            "glyphs": [
              "I",
              "L",
              "O",
              "A"
            ]
          },
          "hintAudioIds": [
            "hint_draw_trace"
          ],
          "successAudioId": "celebrate_01"
        },
        {
          "stars": 2,
          "label": "Kulatá a šikmá (B, D, K, M)",
          "config": {
            "glyphs": [
              "B",
              "D",
              "K",
              "M"
            ]
          },
          "hintAudioIds": [
            "hint_draw_trace"
          ],
          "successAudioId": "celebrate_01"
        },
        {
          "stars": 3,
          "label": "Číslice 1–9 a S, Ž",
          "config": {
            "glyphs": [
              "S",
              "Ž",
              "3",
              "8"
            ]
          },
          "hintAudioIds": [
            "hint_draw_trace"
          ],
          "successAudioId": "celebrate_01"
        }
      ]
    },
    {
      "id": "act_13_rhyme_memory",
      "number": 13,
      "zoneId": "zone_c",
      "title": "Rýmovací pexeso",
      "shortTitle": "Rýmovací pexeso",
      "icon": "🎵",
      "type": "rhyme_memory",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Cit pro rytmus jazyka, rozlišování koncových rýmů a paměť.",
      "audioIntroId": "act_13_intro",
      "levels": [
        {
          "stars": 1,
          "label": "3 rýmové páry",
          "config": {
            "pairs": [
              [
                "kočka",
                "vločka"
              ],
              [
                "myš",
                "skrýš"
              ],
              [
                "pes",
                "les"
              ]
            ]
          },
          "hintAudioIds": [
            "hint_letter_listen"
          ],
          "successAudioId": "celebrate_05"
        },
        {
          "stars": 2,
          "label": "4 rýmové páry",
          "config": {
            "pairs": 4
          },
          "hintAudioIds": [
            "hint_letter_listen"
          ],
          "successAudioId": "celebrate_05"
        },
        {
          "stars": 3,
          "label": "6 rýmových párů",
          "config": {
            "pairs": 6
          },
          "hintAudioIds": [
            "hint_letter_listen"
          ],
          "successAudioId": "celebrate_05"
        }
      ]
    },
    {
      "id": "act_14_feed_penguin",
      "number": 14,
      "zoneId": "zone_d",
      "title": "Krmení tučňáka (Počítání rybiček)",
      "shortTitle": "Krmení tučňáka",
      "icon": "🐟",
      "type": "feed_penguin",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Kardinální chápání počtu do 10 a 20, přiřazení 1:1 a hlasité počítání po jedné.",
      "audioIntroId": "act_14_intro",
      "levels": [
        {
          "stars": 1,
          "label": "Počítání do 5",
          "config": {
            "minTarget": 2,
            "maxTarget": 5,
            "pondCount": 8,
            "rounds": [
              3,
              5,
              4
            ]
          },
          "hintAudioIds": [
            "hint_count_more",
            "hint_count_too_many"
          ],
          "successAudioId": "celebrate_03"
        },
        {
          "stars": 2,
          "label": "Počítání do 10",
          "config": {
            "minTarget": 6,
            "maxTarget": 10,
            "pondCount": 12,
            "rounds": [
              6,
              8,
              9
            ]
          },
          "hintAudioIds": [
            "hint_count_more",
            "hint_count_too_many"
          ],
          "successAudioId": "celebrate_03"
        },
        {
          "stars": 3,
          "label": "Počítání do 15 (až 20)",
          "config": {
            "minTarget": 11,
            "maxTarget": 15,
            "pondCount": 18,
            "rounds": [
              12,
              14,
              15
            ]
          },
          "hintAudioIds": [
            "hint_count_more",
            "hint_count_too_many"
          ],
          "successAudioId": "celebrate_03"
        }
      ]
    },
    {
      "id": "act_15_ice_scales",
      "number": 15,
      "zoneId": "zone_d",
      "title": "Ledové váhy (Porovnávání množství)",
      "shortTitle": "Ledové váhy",
      "icon": "⚖️",
      "type": "ice_scales",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Porozumění pojmům více, méně a stejně na principu rovnováhy.",
      "audioIntroId": "act_15_intro",
      "levels": [
        {
          "stars": 1,
          "label": "Do 5 položek",
          "config": {
            "max": 5
          },
          "hintAudioIds": [
            "hint_count_more"
          ],
          "successAudioId": "celebrate_01"
        },
        {
          "stars": 2,
          "label": "Do 10 položek",
          "config": {
            "max": 10
          },
          "hintAudioIds": [
            "hint_count_more"
          ],
          "successAudioId": "celebrate_01"
        },
        {
          "stars": 3,
          "label": "Různé váhy plodů",
          "config": {
            "max": 12
          },
          "hintAudioIds": [
            "hint_count_more"
          ],
          "successAudioId": "celebrate_01"
        }
      ]
    },
    {
      "id": "act_16_story_math",
      "number": 16,
      "zoneId": "zone_d",
      "title": "První sčítání a odčítání s příběhem",
      "shortTitle": "Sčítání s příběhem",
      "icon": "➕",
      "type": "story_math",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Názorné pochopení operací přidávání a ubírání v kontextu příběhu.",
      "audioIntroId": "act_16_intro",
      "levels": [
        {
          "stars": 1,
          "label": "Sčítání do 5",
          "config": {
            "max": 5
          },
          "hintAudioIds": [
            "hint_count_more"
          ],
          "successAudioId": "celebrate_02"
        },
        {
          "stars": 2,
          "label": "Sčítání a odčítání do 10",
          "config": {
            "max": 10
          },
          "hintAudioIds": [
            "hint_count_more"
          ],
          "successAudioId": "celebrate_02"
        },
        {
          "stars": 3,
          "label": "Slovní úlohy do 15",
          "config": {
            "max": 15
          },
          "hintAudioIds": [
            "hint_count_more"
          ],
          "successAudioId": "celebrate_02"
        }
      ]
    },
    {
      "id": "act_17_size_sort",
      "number": 17,
      "zoneId": "zone_d",
      "title": "Seřaď podle velikosti a délky",
      "shortTitle": "Řazení velikostí",
      "icon": "📏",
      "type": "size_sort",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Seriace (uspořádání podle měřitelné veličiny od nejmenšího po největší).",
      "audioIntroId": "act_17_intro",
      "levels": [
        {
          "stars": 1,
          "label": "3 objekty",
          "config": {
            "items": 3
          },
          "hintAudioIds": [
            "hint_shape_size"
          ],
          "successAudioId": "celebrate_01"
        },
        {
          "stars": 2,
          "label": "5 objektů",
          "config": {
            "items": 5
          },
          "hintAudioIds": [
            "hint_shape_size"
          ],
          "successAudioId": "celebrate_01"
        },
        {
          "stars": 3,
          "label": "6 objektů s drobným rozdílem",
          "config": {
            "items": 6
          },
          "hintAudioIds": [
            "hint_shape_size"
          ],
          "successAudioId": "celebrate_01"
        }
      ]
    },
    {
      "id": "act_18_pattern_complete",
      "number": 18,
      "zoneId": "zone_e",
      "title": "Dokonči vzor (Logické řady)",
      "shortTitle": "Dokonči vzor",
      "icon": "❄️",
      "type": "pattern_complete",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Rozpoznávání pravidelností a logických sekvencí ABAB, AABB a ABC.",
      "audioIntroId": "act_18_intro",
      "levels": [
        {
          "stars": 1,
          "label": "Střídání ABAB",
          "config": {
            "pattern": "ABAB"
          },
          "hintAudioIds": [
            "hint_pattern_repeat"
          ],
          "successAudioId": "celebrate_02"
        },
        {
          "stars": 2,
          "label": "Trojice ABCABC",
          "config": {
            "pattern": "ABC"
          },
          "hintAudioIds": [
            "hint_pattern_repeat"
          ],
          "successAudioId": "celebrate_02"
        },
        {
          "stars": 3,
          "label": "Dvojitá pravidla AABB",
          "config": {
            "pattern": "AABB"
          },
          "hintAudioIds": [
            "hint_pattern_repeat"
          ],
          "successAudioId": "celebrate_02"
        }
      ]
    },
    {
      "id": "act_19_ice_maze",
      "number": 19,
      "zoneId": "zone_e",
      "title": "Ledové bludiště",
      "shortTitle": "Ledové bludiště",
      "icon": "🧊",
      "type": "ice_maze",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Plánování cesty, předvídání slepých uliček a koordinace prstu.",
      "audioIntroId": "act_19_intro",
      "levels": [
        {
          "stars": 1,
          "label": "Jednoduchá cestička",
          "config": {
            "grid": 5
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_06"
        },
        {
          "stars": 2,
          "label": "Bludiště s klíčem",
          "config": {
            "grid": 7,
            "keys": 1
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_06"
        },
        {
          "stars": 3,
          "label": "Velké ledové bludiště",
          "config": {
            "grid": 9,
            "keys": 2
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_06"
        }
      ]
    },
    {
      "id": "act_20_sound_memory",
      "number": 20,
      "zoneId": "zone_e",
      "title": "Zvukové a vizuální pexeso",
      "shortTitle": "Zvukové pexeso",
      "icon": "🥁",
      "type": "sound_memory",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Trénink pracovní paměti a sluchového rozlišování zvířat a nástrojů.",
      "audioIntroId": "act_20_intro",
      "levels": [
        {
          "stars": 1,
          "label": "3×2 karty",
          "config": {
            "cols": 3,
            "rows": 2
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_02"
        },
        {
          "stars": 2,
          "label": "4×3 karty",
          "config": {
            "cols": 4,
            "rows": 3
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_02"
        },
        {
          "stars": 3,
          "label": "4×4 karty (zvukové)",
          "config": {
            "cols": 4,
            "rows": 4
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_02"
        }
      ]
    },
    {
      "id": "act_21_coding_path",
      "number": 21,
      "zoneId": "zone_e",
      "title": "Kódování cesty (První programování)",
      "shortTitle": "Kódování cesty",
      "icon": "🧭",
      "type": "coding_path",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Algoritmické myšlení, skládání sekvence kroků a ladění trasy.",
      "audioIntroId": "act_21_intro",
      "levels": [
        {
          "stars": 1,
          "label": "3–4 kroky bez zatáček",
          "config": {
            "steps": 4
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_06"
        },
        {
          "stars": 2,
          "label": "Zatáčky vlevo a vpravo",
          "config": {
            "steps": 7
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_06"
        },
        {
          "stars": 3,
          "label": "Trasa s překážkami a pokladem",
          "config": {
            "steps": 10
          },
          "hintAudioIds": [
            "hint_idle_encourage"
          ],
          "successAudioId": "celebrate_06"
        }
      ]
    },
    {
      "id": "act_22_matrix_sort",
      "number": 22,
      "zoneId": "zone_e",
      "title": "Třídění podle více vlastností (Matice)",
      "shortTitle": "Třídící matice",
      "icon": "🗂️",
      "type": "matrix_sort",
      "implementedInPrototype": true,
      "pedagogicalGoal": "Klasifikace objektů podle dvou současných kritérií (barva × tvar / roční období).",
      "audioIntroId": "act_22_intro",
      "levels": [
        {
          "stars": 1,
          "label": "Tabulka 2×2",
          "config": {
            "rows": 2,
            "cols": 2
          },
          "hintAudioIds": [
            "hint_shape_size"
          ],
          "successAudioId": "celebrate_02"
        },
        {
          "stars": 2,
          "label": "Tabulka 3×3",
          "config": {
            "rows": 3,
            "cols": 3
          },
          "hintAudioIds": [
            "hint_shape_size"
          ],
          "successAudioId": "celebrate_02"
        },
        {
          "stars": 3,
          "label": "Roční období a oblečení",
          "config": {
            "rows": 3,
            "cols": 4
          },
          "hintAudioIds": [
            "hint_shape_size"
          ],
          "successAudioId": "celebrate_02"
        }
      ]
    }
  ]
},
  audioManifest: {
  "version": "1.0.0",
  "defaultVoice": "cs-CZ-VlastaNeural",
  "fallbackVoice": "cs-CZ-AntoninNeural",
  "defaultRate": "+5%",
  "defaultPitch": "+52Hz",
  "entries": [
    {
      "id": "intro_welcome",
      "category": "system",
      "text_cs": "Ahoj kamaráde! Já jsem tučňák Piko. Vyber si ostrov a pojď si hrát!",
      "karaoke_text": "AHOJ KAMARÁDE! JÁ JSEM TUČŇÁK PIKO. VYBER SI OSTROV A POJĎ SI HRÁT!",
      "intonation_note": "Vřele, vesele a povzbudivě, s krátkou pauzou po oslovení.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+52Hz",
      "file": "assets/audio/intro_welcome.mp3"
    },
    {
      "id": "intro_map_select",
      "category": "system",
      "text_cs": "Ťukni na některý ostrov nebo si vyber hru nahoře!",
      "karaoke_text": "ŤUKNI NA NĚKTERÝ OSTROV NEBO SI VYBER HRU NAHOŘE!",
      "intonation_note": "Přátelské vyzvání k akci, zřetelná artikulace.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+52Hz",
      "file": "assets/audio/intro_map_select.mp3"
    },
    {
      "id": "intro_repeat",
      "category": "system",
      "text_cs": "Poslouchej pozorně, zopakuji ti úkol ještě jednou.",
      "karaoke_text": "POSLOUCHEJ POZORNĚ, ZOPAKUJI TI ÚKOL JEŠTĚ JEDNOU.",
      "intonation_note": "Klidně a trpělivě.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+52Hz",
      "file": "assets/audio/intro_repeat.mp3"
    },
    {
      "id": "zone_a_intro",
      "category": "zone",
      "text_cs": "Vítej v Uměleckém ateliéru! Tady budeme kreslit a míchat kouzelné barvy.",
      "karaoke_text": "VÍTEJ V UMĚLECKÉM ATELIÉRU! TADY BUDEME KRESLIT A MÍCHAT KOUZELNÉ BARVY.",
      "intonation_note": "Nadšeně, tvořivě.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/zone_a_intro.mp3"
    },
    {
      "id": "zone_b_intro",
      "category": "zone",
      "text_cs": "Tohle je Svět tvarů a prostoru! Pojď skládat obrázky a hledat stíny.",
      "karaoke_text": "TOHLE JE SVĚT TVARŮ A PROSTORU! POJĎ SKLÁDAT OBRÁZKY A HLEDAT STÍNY.",
      "intonation_note": "Zvídavě a hravě.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/zone_b_intro.mp3"
    },
    {
      "id": "zone_c_intro",
      "category": "zone",
      "text_cs": "Jsme u prvních krůčků ke čtení! Spolu prozkoumáme písmenka a slabiky.",
      "karaoke_text": "JSME U PRVNÍCH KRŮČKŮ KE ČTENÍ! SPOLU PROZKOUMÁME PÍSMENKA A SLABIKY.",
      "intonation_note": "Zřetelně a povzbudivě.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/zone_c_intro.mp3"
    },
    {
      "id": "zone_d_intro",
      "category": "zone",
      "text_cs": "Hurá do hravé matematiky! Spočítáme rybičky a zvážíme ledové kry.",
      "karaoke_text": "HURÁ DO HRAVÉ MATEMATIKY! SPOČÍTÁME RYBIČKY A ZVÁŽÍME LEDOVÉ KRY.",
      "intonation_note": "Radostně s energií.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/zone_d_intro.mp3"
    },
    {
      "id": "zone_e_intro",
      "category": "zone",
      "text_cs": "Vítej na ostrově logiky a paměti! Čeká nás bludiště i pexeso.",
      "karaoke_text": "VÍTEJ NA OSTROVĚ LOGIKY A PAMĚTI! ČEKÁ NÁS BLUDIŠTĚ I PEXESO.",
      "intonation_note": "Dobrodružně a tajemně.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/zone_e_intro.mp3"
    },
    {
      "id": "act_01_intro",
      "category": "activity_intro",
      "text_cs": "Pojď kreslit krok za krokem! Nejprve prstem obtáhni přerušovaný tvar.",
      "karaoke_text": "POJĎ KRESLIT KROK ZA KROKEM! NEJPRVE PRSTEM OBTÁHNI PŘERUŠOVANÝ TVAR.",
      "intonation_note": "Pomaleji, jasná instrukce.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_01_intro.mp3"
    },
    {
      "id": "act_02_intro",
      "category": "activity_intro",
      "text_cs": "Vybarvi obrázek a zkus v paletě smíchat dvě barvy dohromady!",
      "karaoke_text": "VYBARVI OBRÁZEK A ZKUS V PALETĚ SMÍCHAT DVĚ BARVY DOHROMADY!",
      "intonation_note": "Kouzelnický, nadšený tón.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_02_intro.mp3"
    },
    {
      "id": "act_03_intro",
      "category": "activity_intro",
      "text_cs": "Kresli na pravou stranu plátna a sleduj kouzelné zrcadlení!",
      "karaoke_text": "KRESLI NA PRAVOU STRANU PLÁTNA A SLEDUJ KOUZELNÉ ZRCADLENÍ!",
      "intonation_note": "Hravě a s úžasem.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_03_intro.mp3"
    },
    {
      "id": "act_04_intro",
      "category": "activity_intro",
      "text_cs": "V příběhu něco chybí! Podívej se na obrázek a dokresli, co je potřeba.",
      "karaoke_text": "V PŘÍBĚHU NĚCO CHYBÍ! PODÍVEJ SE NA OBRÁZEK A DOKRESLI, CO JE POTŘEBA.",
      "intonation_note": "Zvídavě, vyprávěcím tónem.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_04_intro.mp3"
    },
    {
      "id": "act_05_intro",
      "category": "activity_intro",
      "text_cs": "Spojuj tečky pěkně po jedné podle čísel a odhal tajný obrázek!",
      "karaoke_text": "SPOJUJ TEČKY PĚKNĚ PO JEDNÉ PODLE ČÍSEL A ODHAL TAJNÝ OBRÁZEK!",
      "intonation_note": "Povzbudivě.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_05_intro.mp3"
    },
    {
      "id": "act_06_intro",
      "category": "activity_intro",
      "text_cs": "Poskládej obrázek z barevných tvarů! Přetáhni každý dílek na jeho místo.",
      "karaoke_text": "POSKLÁDEJ OBRÁZEK Z BAREVNÝCH TVARŮ! PŘETÁHNI KAŽDÝ DÍLEK NA JEHO MÍSTO.",
      "intonation_note": "Jasně a s nadšením.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_06_intro.mp3"
    },
    {
      "id": "act_07_intro",
      "category": "activity_intro",
      "text_cs": "Najdi ke každému obrázku jeho správný tmavý stín!",
      "karaoke_text": "NAJDI KE KAŽDÉMU OBRÁZKU JEHO SPRÁVNÝ TMAVÝ STÍN!",
      "intonation_note": "Pozorně, detektivně.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_07_intro.mp3"
    },
    {
      "id": "act_08_intro",
      "category": "activity_intro",
      "text_cs": "Podívej se pozorně na celý obrázek a najdi věci, které sem nepatří!",
      "karaoke_text": "PODÍVEJ SE POZORNĚ NA CELÝ OBRÁZEK A NAJDI VĚCI, KTERÉ SEM NEPATŘÍ!",
      "intonation_note": "Pobaveně a zvídavě.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_08_intro.mp3"
    },
    {
      "id": "act_09_intro",
      "category": "activity_intro",
      "text_cs": "Obrázek se nám rozsypal! Slož všechny dílky puzzle zase k sobě.",
      "karaoke_text": "OBRÁZEK SE NÁM ROZSYPAL! SLOŽ VŠECHNY DÍLKY PUZZLE ZASE K SOBĚ.",
      "intonation_note": "Hravě.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_09_intro.mp3"
    },
    {
      "id": "act_10_intro",
      "category": "activity_intro",
      "text_cs": "Poslouchej dobře první hlásku slova a vyber správné písmenko!",
      "karaoke_text": "POSLOUCHEJ DOBŘE PRVNÍ HLÁSKU SLOVA A VYBER SPRÁVNÉ PÍSMENKO!",
      "intonation_note": "Zřetelná výslovnost.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_10_intro.mp3"
    },
    {
      "id": "act_11_intro",
      "category": "activity_intro",
      "text_cs": "Ťukni na slabiky a poskládej z nich celé slovo!",
      "karaoke_text": "ŤUKNI NA SLABIKY A POSKLÁDEJ Z NICH CELÉ SLOVO!",
      "intonation_note": "Rytmicky po slabikách.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_11_intro.mp3"
    },
    {
      "id": "act_12_intro",
      "category": "activity_intro",
      "text_cs": "Projeď prstem po ledové dráze podle šipek a napiš písmenko!",
      "karaoke_text": "PROJEĎ PRSTEM PO LEDOVÉ DRÁZE PODLE ŠIPEK A NAPIŠ PÍSMENKO!",
      "intonation_note": "Klidně a pečlivě.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_12_intro.mp3"
    },
    {
      "id": "act_13_intro",
      "category": "activity_intro",
      "text_cs": "Otáčej kartičky a najdi dvojice slov, která se spolu rýmují!",
      "karaoke_text": "OTÁČEJ KARTIČKY A NAJDI DVOJICE SLOV, KTERÁ SE SPOLU RÝMUJÍ!",
      "intonation_note": "Básnicky a vesele.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_13_intro.mp3"
    },
    {
      "id": "act_14_intro",
      "category": "activity_intro",
      "text_cs": "Mám veliký hlad! Dej mi prosím do misky přesně tolik rybiček, kolik si přeji.",
      "karaoke_text": "MÁM VELIKÝ HLAD! DEJ MI PROSÍM DO MISKY PŘESNĚ TOLIK RYBIČEK, KOLIK SI PŘEJI.",
      "intonation_note": "Roztomile a s nadšením na jídlo.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_14_intro.mp3"
    },
    {
      "id": "act_15_intro",
      "category": "activity_intro",
      "text_cs": "Vyrovnej ledové váhy tak, aby na obou miskách bylo úplně stejně!",
      "karaoke_text": "VYROVNEJ LEDOVÉ VÁHY TAK, ABY NA OBOU MISKÁCH BYLO ÚPLNĚ STEJNĚ!",
      "intonation_note": "Jasně a vyváženě.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_15_intro.mp3"
    },
    {
      "id": "act_16_intro",
      "category": "activity_intro",
      "text_cs": "Poslouchej krátký příběh a spočítej, kolik tučňáků je na kře dohromady!",
      "karaoke_text": "POSLOUCHEJ KRÁTKÝ PŘÍBĚH A SPOČÍTEJ, KOLIK TUČŇÁKŮ JE NA KŘE DOHROMADY!",
      "intonation_note": "Vyprávěcím tónem.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_16_intro.mp3"
    },
    {
      "id": "act_17_intro",
      "category": "activity_intro",
      "text_cs": "Seřaď všechny obrázky pěkně za sebou od nejmenšího po největší!",
      "karaoke_text": "SEŘAĎ VŠECHNY OBRÁZKY PĚKNĚ ZA SEBOU OD NEJMENŠÍHO PO NEJVĚTŠÍ!",
      "intonation_note": "S důrazem na kontrast nejmenší – největší.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_17_intro.mp3"
    },
    {
      "id": "act_18_intro",
      "category": "activity_intro",
      "text_cs": "Podívej se na řadu obrázků a doplň ten, který v ní chybí!",
      "karaoke_text": "PODÍVEJ SE NA ŘADU OBRÁZKŮ A DOPLŇ TEN, KTERÝ V NÍ CHYBÍ!",
      "intonation_note": "Rytmicky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_18_intro.mp3"
    },
    {
      "id": "act_19_intro",
      "category": "activity_intro",
      "text_cs": "Pomoz tučňákovi najít bezpečnou cestu ledovým bludištěm až k pokladu!",
      "karaoke_text": "POMOZ TUČŇÁKOVI NAJÍT BEZPEČNOU CESTU LEDOVÝM BLUDIŠTĚM AŽ K POKLADU!",
      "intonation_note": "Dobrodružně.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_19_intro.mp3"
    },
    {
      "id": "act_20_intro",
      "category": "activity_intro",
      "text_cs": "Procvič si ouška i očička! Najdi dvě kartičky se stejným obrázkem nebo zvukem.",
      "karaoke_text": "PROCVIČ SI OUŠKA I OČIČKA! NAJDI DVĚ KARTIČKY SE STEJNÝM OBRÁZKEM NEBO ZVUKEM.",
      "intonation_note": "Hravě a jemně.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_20_intro.mp3"
    },
    {
      "id": "act_21_intro",
      "category": "activity_intro",
      "text_cs": "Slož cestu ze šipek a pak zmáčkni zelené tlačítko, ať vyrazím za pokladem!",
      "karaoke_text": "SLOŽ CESTU ZE ŠIPEK A PAK ZMÁČKNI ZELENÉ TLAČÍTKO, AŤ VYRAZÍM ZA POKLADEM!",
      "intonation_note": "Povzbudivě a s nadšením.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_21_intro.mp3"
    },
    {
      "id": "act_22_intro",
      "category": "activity_intro",
      "text_cs": "Zařaď obrázky do tabulky podle jejich barvy i tvaru zároveň!",
      "karaoke_text": "ZAŘAĎ OBRÁZKY DO TABULKY PODLE JEJICH BARVY I TVARU ZÁROVEŇ!",
      "intonation_note": "Klidně a srozumitelně.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/act_22_intro.mp3"
    },
    {
      "id": "draw_step_oval",
      "category": "drawing",
      "text_cs": "První krok: nakresli velký kulatý ovál pro tělíčko.",
      "karaoke_text": "PRVNÍ KROK: NAKRESLI VELKÝ KULATÝ OVÁL PRO TĚLÍČKO.",
      "intonation_note": "Klidně a povzbudivě.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+5%",
      "pitch": "+52Hz",
      "file": "assets/audio/draw_step_oval.mp3"
    },
    {
      "id": "draw_step_head",
      "category": "drawing",
      "text_cs": "Výborně! Teď nahoře přikresli kulatou hlavičku.",
      "karaoke_text": "VÝBORNĚ! TEĎ NAHOŘE PŘIKRESLI KULATOU HLAVIČKU.",
      "intonation_note": "Pochvala a plynulé navázání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+5%",
      "pitch": "+52Hz",
      "file": "assets/audio/draw_step_head.mp3"
    },
    {
      "id": "draw_step_wings",
      "category": "drawing",
      "text_cs": "Paráda! Přidej po stranách dvě mávající křidélka.",
      "karaoke_text": "PARÁDA! PŘIDEJ PO STRANÁCH DVĚ MÁVAJÍCÍ KŘIDÉLKA.",
      "intonation_note": "Vesele.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+5%",
      "pitch": "+52Hz",
      "file": "assets/audio/draw_step_wings.mp3"
    },
    {
      "id": "draw_step_face",
      "category": "drawing",
      "text_cs": "A nakonec očíčka a špičatý zobáček, ať na tebe kouká!",
      "karaoke_text": "A NAKONEC OČÍČKA A ŠPIČATÝ ZOBÁČEK, AŤ NA TEBE KOUKÁ!",
      "intonation_note": "Milým hlasem.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+5%",
      "pitch": "+52Hz",
      "file": "assets/audio/draw_step_face.mp3"
    },
    {
      "id": "draw_step_ears",
      "category": "drawing",
      "text_cs": "Přikresli dvě špičatá kočičí ouška a dlouhé fousky!",
      "karaoke_text": "PŘIKRESLI DVĚ ŠPIČATÁ KOČIČÍ OUŠKA A DLOUHÉ FOUSKY!",
      "intonation_note": "Hravě.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+5%",
      "pitch": "+52Hz",
      "file": "assets/audio/draw_step_ears.mp3"
    },
    {
      "id": "draw_step_rocket_body",
      "category": "drawing",
      "text_cs": "Nakresli vysoký trup vesmírné rakety a kulaté okénko!",
      "karaoke_text": "NAKRESLI VYSOKÝ TRUP VESMÍRNÉ RAKETY A KULATÉ OKÉNKO!",
      "intonation_note": "Dobrodružně.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+5%",
      "pitch": "+52Hz",
      "file": "assets/audio/draw_step_rocket_body.mp3"
    },
    {
      "id": "draw_step_rocket_nose",
      "category": "drawing",
      "text_cs": "Na vršek rakety nakresli špičatou střechu a dolů dvě křidélka!",
      "karaoke_text": "NA VRŠEK RAKETY NAKRESLI ŠPIČATOU STŘECHU A DOLŮ DVĚ KŘIDÉLKA!",
      "intonation_note": "Nadšeně.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+5%",
      "pitch": "+52Hz",
      "file": "assets/audio/draw_step_rocket_nose.mp3"
    },
    {
      "id": "draw_step_alive",
      "category": "drawing",
      "text_cs": "Jé, tvůj obrázek ožil! Teď si ho můžeš vybarvit a namíchat kouzelné barvy!",
      "karaoke_text": "JÉ, TVŮJ OBRÁZEK OŽIL! TEĎ SI HO MŮŽEŠ VYBARVIT A NAMÍCHAT KOUZELNÉ BARVY!",
      "intonation_note": "S velikým úžasem a radostí.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+5%",
      "pitch": "+52Hz",
      "file": "assets/audio/draw_step_alive.mp3"
    },
    {
      "id": "color_mix_yellow_blue",
      "category": "drawing",
      "text_cs": "Kouzlo! Smícháním žluté a modré barvy vznikla krásná zelená!",
      "karaoke_text": "KOUZLO! SMÍCHÁNÍM ŽLUTÉ A MODRÉ BARVY VZNIKLA KRÁSNÁ ZELENÁ!",
      "intonation_note": "Udiveně a kouzelnicky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+5%",
      "pitch": "+52Hz",
      "file": "assets/audio/color_mix_yellow_blue.mp3"
    },
    {
      "id": "color_mix_red_yellow",
      "category": "drawing",
      "text_cs": "Podívej! Červená a žlutá se spojily v zářivě oranžovou!",
      "karaoke_text": "PODÍVEJ! ČERVENÁ A ŽLUTÁ SE SPOJILY V ZÁŘIVĚ ORANŽOVOU!",
      "intonation_note": "Vesele a objevně.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+5%",
      "pitch": "+52Hz",
      "file": "assets/audio/color_mix_red_yellow.mp3"
    },
    {
      "id": "color_mix_red_blue",
      "category": "drawing",
      "text_cs": "Paráda! Z červené a modré jsi vykouzlil kouzelnou fialovou!",
      "karaoke_text": "PARÁDA! Z ČERVENÉ A MODRÉ JSI VYKOUZLIL KOUZELNOU FIALOVOU!",
      "intonation_note": "Obdivně.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+5%",
      "pitch": "+52Hz",
      "file": "assets/audio/color_mix_red_blue.mp3"
    },
    {
      "id": "symmetry_done",
      "category": "drawing",
      "text_cs": "Nádherná souměrná kresba! Obě strany jsou krásně vyvážené.",
      "karaoke_text": "NÁDHERNÁ SOUMĚRNÁ KRESBA! OBĚ STRANY JSOU KRÁSNĚ VYVÁŽENÉ.",
      "intonation_note": "Ocenění kreativity.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+5%",
      "pitch": "+52Hz",
      "file": "assets/audio/symmetry_done.mp3"
    },
    {
      "id": "hint_shape_corners",
      "category": "hint",
      "text_cs": "Zkus se podívat, kolik má ten tvar rohů, a najdi stejný obrys.",
      "karaoke_text": "ZKUS SE PODÍVAT, KOLIK MÁ TEN TVAR ROHŮ, A NAJDI STEJNÝ OBRYS.",
      "intonation_note": "Jemné, trpělivé navedení bez kritiky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+0%",
      "pitch": "+46Hz",
      "file": "assets/audio/hint_shape_corners.mp3"
    },
    {
      "id": "hint_shape_rotate",
      "category": "hint",
      "text_cs": "Ten dílek tam skoro pasuje! Zkus ho trochu pootočit tlačítkem otočit.",
      "karaoke_text": "TEN DÍLEK TAM SKORO PASUJE! ZKUS HO TROCHU POOTOČIT TLAČÍTKEM OTOČIT.",
      "intonation_note": "Povzbudivě, podpůrně.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+0%",
      "pitch": "+46Hz",
      "file": "assets/audio/hint_shape_rotate.mp3"
    },
    {
      "id": "hint_shape_size",
      "category": "hint",
      "text_cs": "Podívej se na velikost a barvu místa, které ti tady svítí.",
      "karaoke_text": "PODÍVEJ SE NA VELIKOST A BARVU MÍSTA, KTERÉ TI TADY SVÍTÍ.",
      "intonation_note": "Něžná nápověda.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+0%",
      "pitch": "+46Hz",
      "file": "assets/audio/hint_shape_size.mp3"
    },
    {
      "id": "hint_count_more",
      "category": "hint",
      "text_cs": "Mám ještě trochu hlad! Zkus do misky přidat ještě pár rybiček.",
      "karaoke_text": "MÁM JEŠTĚ TROCHU HLAD! ZKUS DO MISKY PŘIDAT JEŠTĚ PÁR RYBIČEK.",
      "intonation_note": "Kamarádsky a vlídně.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+0%",
      "pitch": "+46Hz",
      "file": "assets/audio/hint_count_more.mp3"
    },
    {
      "id": "hint_count_too_many",
      "category": "hint",
      "text_cs": "Jé, to je trochu moc! Ťukni na rybičku v misce a jednu vrať do jezírka.",
      "karaoke_text": "JÉ, TO JE TROCHU MOC! ŤUKNI NA RYBIČKU V MISCE A JEDNU VRAŤ DO JEZÍRKA.",
      "intonation_note": "Klidně a s úsměvem, žádná výčitka.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+0%",
      "pitch": "+46Hz",
      "file": "assets/audio/hint_count_too_many.mp3"
    },
    {
      "id": "hint_letter_listen",
      "category": "hint",
      "text_cs": "Zkus si to slovo říct nahlas a poslouchej úplně první hlásku!",
      "karaoke_text": "ZKUS SI TO SLOVO ŘÍCT NAHLAS A POSLOUCHEJ ÚPLNĚ PRVNÍ HLÁSKU!",
      "intonation_note": "Zřetelně, nápomocně.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+0%",
      "pitch": "+46Hz",
      "file": "assets/audio/hint_letter_listen.mp3"
    },
    {
      "id": "hint_pattern_repeat",
      "category": "hint",
      "text_cs": "Řekni si obrázky v řadě nahlas za sebou a hned poznáš, který bude další.",
      "karaoke_text": "ŘEKNI SI OBRÁZKY V ŘADĚ NAHLAS ZA SEBOU A HNED POZNÁŠ, KTERÝ BUDE DALŠÍ.",
      "intonation_note": "Rytmicky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+0%",
      "pitch": "+46Hz",
      "file": "assets/audio/hint_pattern_repeat.mp3"
    },
    {
      "id": "hint_idle_encourage",
      "category": "hint",
      "text_cs": "Jsem tady s tebou! Jestli chceš, ťukni na to, co ti zrovna bliká.",
      "karaoke_text": "JSEM TADY S TEBOU! JESTLI CHCEŠ, ŤUKNI NA TO, CO TI ZROVNA BLIKÁ.",
      "intonation_note": "Velmi něžně a trpělivě.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+0%",
      "pitch": "+46Hz",
      "file": "assets/audio/hint_idle_encourage.mp3"
    },
    {
      "id": "hint_draw_trace",
      "category": "hint",
      "text_cs": "Kresli prstem pomalu po přerušované čáře, vedeš si skvěle!",
      "karaoke_text": "KRESLI PRSTEM POMALU PO PŘERUŠOVANÉ ČÁŘE, VEDEŠ SI SKVĚLE!",
      "intonation_note": "Povzbudivě.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+0%",
      "pitch": "+46Hz",
      "file": "assets/audio/hint_draw_trace.mp3"
    },
    {
      "id": "num_01",
      "category": "number",
      "text_cs": "Jedna.",
      "karaoke_text": "JEDNA!",
      "intonation_note": "Jasné a veselé počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_01.mp3"
    },
    {
      "id": "num_02",
      "category": "number",
      "text_cs": "Dvě.",
      "karaoke_text": "DVĚ!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_02.mp3"
    },
    {
      "id": "num_03",
      "category": "number",
      "text_cs": "Tři.",
      "karaoke_text": "TŘI!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_03.mp3"
    },
    {
      "id": "num_04",
      "category": "number",
      "text_cs": "Čtyři.",
      "karaoke_text": "ČTYŘI!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_04.mp3"
    },
    {
      "id": "num_05",
      "category": "number",
      "text_cs": "Pět.",
      "karaoke_text": "PĚT!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_05.mp3"
    },
    {
      "id": "num_06",
      "category": "number",
      "text_cs": "Šest.",
      "karaoke_text": "ŠEST!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_06.mp3"
    },
    {
      "id": "num_07",
      "category": "number",
      "text_cs": "Sedm.",
      "karaoke_text": "SEDM!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_07.mp3"
    },
    {
      "id": "num_08",
      "category": "number",
      "text_cs": "Osm.",
      "karaoke_text": "OSM!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_08.mp3"
    },
    {
      "id": "num_09",
      "category": "number",
      "text_cs": "Devět.",
      "karaoke_text": "DEVĚT!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_09.mp3"
    },
    {
      "id": "num_10",
      "category": "number",
      "text_cs": "Deset.",
      "karaoke_text": "DESET!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_10.mp3"
    },
    {
      "id": "num_11",
      "category": "number",
      "text_cs": "Jedenáct.",
      "karaoke_text": "JEDENÁCT!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_11.mp3"
    },
    {
      "id": "num_12",
      "category": "number",
      "text_cs": "Dvanáct.",
      "karaoke_text": "DVANÁCT!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_12.mp3"
    },
    {
      "id": "num_13",
      "category": "number",
      "text_cs": "Třináct.",
      "karaoke_text": "TŘINÁCT!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_13.mp3"
    },
    {
      "id": "num_14",
      "category": "number",
      "text_cs": "Čtrnáct.",
      "karaoke_text": "ČTRNÁCT!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_14.mp3"
    },
    {
      "id": "num_15",
      "category": "number",
      "text_cs": "Patnáct.",
      "karaoke_text": "PATNÁCT!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_15.mp3"
    },
    {
      "id": "num_16",
      "category": "number",
      "text_cs": "Šestnáct.",
      "karaoke_text": "ŠESTNÁCT!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_16.mp3"
    },
    {
      "id": "num_17",
      "category": "number",
      "text_cs": "Sedmnáct.",
      "karaoke_text": "SEDMNÁCT!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_17.mp3"
    },
    {
      "id": "num_18",
      "category": "number",
      "text_cs": "Osmnáct.",
      "karaoke_text": "OSMNÁCT!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_18.mp3"
    },
    {
      "id": "num_19",
      "category": "number",
      "text_cs": "Devatenáct.",
      "karaoke_text": "DEVATENÁCT!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_19.mp3"
    },
    {
      "id": "num_20",
      "category": "number",
      "text_cs": "Dvacet.",
      "karaoke_text": "DVACET!",
      "intonation_note": "Jasné počítání.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+6%",
      "pitch": "+54Hz",
      "file": "assets/audio/num_20.mp3"
    },
    {
      "id": "celebrate_01",
      "category": "celebrate",
      "text_cs": "Skvělá práce, krásně jsi to sladil a nevzdal ses!",
      "karaoke_text": "SKVĚLÁ PRÁCE, KRÁSNĚ JSI TO SLADIL A NEVZDAL SES!",
      "intonation_note": "Upřímná radost a ocenění úsilí.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+8%",
      "pitch": "+58Hz",
      "file": "assets/audio/celebrate_01.mp3"
    },
    {
      "id": "celebrate_02",
      "category": "celebrate",
      "text_cs": "Hurá! Máš skvělé oko a moc pěkně jsi přemýšlel!",
      "karaoke_text": "HURÁ! MÁŠ SKVĚLÉ OKO A MOC PĚKNĚ JSI PŘEMÝŠLEL!",
      "intonation_note": "Jásavě, pochvala za soustředění.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+8%",
      "pitch": "+58Hz",
      "file": "assets/audio/celebrate_02.mp3"
    },
    {
      "id": "celebrate_03",
      "category": "celebrate",
      "text_cs": "Mňam, to byla dobrota! Přesně tolik rybiček jsem si přál, děkuji!",
      "karaoke_text": "MŇAM, TO BYLA DOBROTA! PŘESNĚ TOLIK RYBIČEK JSEM SI PŘÁL, DĚKUJI!",
      "intonation_note": "Spokojeně a nadšeně.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+8%",
      "pitch": "+58Hz",
      "file": "assets/audio/celebrate_03.mp3"
    },
    {
      "id": "celebrate_04",
      "category": "celebrate",
      "text_cs": "Bravo, mladý umělče! Tohle dílo je jak z pohádkové knížky!",
      "karaoke_text": "BRAVO, MLADÝ UMĚLČE! TOHLE DÍLO JE JAK Z POHÁDKOVÉ KNÍŽKY!",
      "intonation_note": "Obdivně a povzbudivě.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+8%",
      "pitch": "+58Hz",
      "file": "assets/audio/celebrate_04.mp3"
    },
    {
      "id": "celebrate_05",
      "category": "celebrate",
      "text_cs": "Výborně, poznal jsi první hlásku úplně přesně! Máš uši jako rys!",
      "karaoke_text": "VÝBORNĚ, POZNAL JSI PRVNÍ HLÁSKU ÚPLNĚ PŘESNĚ! MÁŠ UŠI JAKO RYS!",
      "intonation_note": "Nadšená pochvala.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+8%",
      "pitch": "+58Hz",
      "file": "assets/audio/celebrate_05.mp3"
    },
    {
      "id": "celebrate_06",
      "category": "celebrate",
      "text_cs": "Tleskám ti křídly! Získáváš zlatou hvězdičku za skvělou snahu!",
      "karaoke_text": "TLESKÁM TI KŘÍDLY! ZÍSKÁVÁŠ ZLATOU HVĚZDIČKU ZA SKVĚLOU SNAHU!",
      "intonation_note": "Radostná oslava.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+8%",
      "pitch": "+58Hz",
      "file": "assets/audio/celebrate_06.mp3"
    },
    {
      "id": "bedtime_yawn",
      "category": "bedtime",
      "text_cs": "Ááách jo, dnes jsme si báječně pohráli, ale mně už padají víčka.",
      "karaoke_text": "ÁÁCH JO, DNES JSME SI BÁJEČNĚ POHRÁLI, ALE MNĚ UŽ PADAJÍ VÍČKA.",
      "intonation_note": "Rozespale, zívnutí na začátku, velmi klidný tón.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "-8%",
      "pitch": "+38Hz",
      "file": "assets/audio/bedtime_yawn.mp3"
    },
    {
      "id": "bedtime_goodnight",
      "category": "bedtime",
      "text_cs": "Oblékám si teplé pyžamko a jdu se vyspat do iglú. Moc se na tebe těším zase zítra, ahoj!",
      "karaoke_text": "OBLÉKÁM SI TEPLÉ PYŽAMKO A JDU SE VYSPAT DO IGLÚ. MOC SE NA TEBE TĚŠÍM ZASE ZÍTRA, AHOJ!",
      "intonation_note": "Láskyplně, pomalu, uklidňující ukolébavkový tón.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "-8%",
      "pitch": "+38Hz",
      "file": "assets/audio/bedtime_goodnight.mp3"
    },
    {
      "id": "word_liska",
      "category": "activity_intro",
      "text_cs": "L, L, LIŠKA! Na jaké písmeno začíná slovo LIŠKA?",
      "karaoke_text": "L-L-LIŠKA! NA JAKÉ PÍSMENO ZAČÍNÁ SLOVO LIŠKA?",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/word_liska.mp3"
    },
    {
      "id": "word_ryba",
      "category": "activity_intro",
      "text_cs": "R, R, RYBA! Na jaké písmeno začíná slovo RYBA?",
      "karaoke_text": "R-R-RYBA! NA JAKÉ PÍSMENO ZAČÍNÁ SLOVO RYBA?",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/word_ryba.mp3"
    },
    {
      "id": "word_auto",
      "category": "activity_intro",
      "text_cs": "A, A, AUTO! Na jaké písmeno začíná slovo AUTO?",
      "karaoke_text": "A-A-AUTO! NA JAKÉ PÍSMENO ZAČÍNÁ SLOVO AUTO?",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/word_auto.mp3"
    },
    {
      "id": "word_kocka",
      "category": "activity_intro",
      "text_cs": "K, K, KOČKA! Na jaké písmeno začíná slovo KOČKA?",
      "karaoke_text": "K-K-KOČKA! NA JAKÉ PÍSMENO ZAČÍNÁ SLOVO KOČKA?",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/word_kocka.mp3"
    },
    {
      "id": "word_slunce",
      "category": "activity_intro",
      "text_cs": "S, S, SLUNCE! Na jaké písmeno začíná slovo SLUNCE?",
      "karaoke_text": "S-S-SLUNCE! NA JAKÉ PÍSMENO ZAČÍNÁ SLOVO SLUNCE?",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/word_slunce.mp3"
    },
    {
      "id": "word_motyl",
      "category": "activity_intro",
      "text_cs": "M, M, MOTÝL! Na jaké písmeno začíná slovo MOTÝL?",
      "karaoke_text": "M-M-MOTÝL! NA JAKÉ PÍSMENO ZAČÍNÁ SLOVO MOTÝL?",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/word_motyl.mp3"
    },
    {
      "id": "word_tucnak",
      "category": "activity_intro",
      "text_cs": "T, T, TUČŇÁK! Na jaké písmeno začíná slovo TUČŇÁK?",
      "karaoke_text": "T-T-TUČŇÁK! NA JAKÉ PÍSMENO ZAČÍNÁ SLOVO TUČŇÁK?",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/word_tucnak.mp3"
    },
    {
      "id": "word_zaba",
      "category": "activity_intro",
      "text_cs": "Ž, Ž, ŽÁBA! Na jaké písmeno začíná slovo ŽÁBA?",
      "karaoke_text": "Ž-Ž-ŽÁBA! NA JAKÉ PÍSMENO ZAČÍNÁ SLOVO ŽÁBA?",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/word_zaba.mp3"
    },
    {
      "id": "word_snek",
      "category": "activity_intro",
      "text_cs": "Š, Š, ŠNEK! Na jaké písmeno začíná slovo ŠNEK?",
      "karaoke_text": "Š-Š-ŠNEK! NA JAKÉ PÍSMENO ZAČÍNÁ SLOVO ŠNEK?",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/word_snek.mp3"
    },
    {
      "id": "feed_ask_03",
      "category": "activity_intro",
      "text_cs": "Mám veliký hlad! Dej mi prosím do misky přesně tři rybičky!",
      "karaoke_text": "MÁM VELIKÝ HLAD! DEJ MI PROSÍM DO MISKY PŘESNĚ 3 RYBIČKY!",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/feed_ask_03.mp3"
    },
    {
      "id": "feed_ask_04",
      "category": "activity_intro",
      "text_cs": "Mám veliký hlad! Dej mi prosím do misky přesně čtyři rybičky!",
      "karaoke_text": "MÁM VELIKÝ HLAD! DEJ MI PROSÍM DO MISKY PŘESNĚ 4 RYBIČKY!",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/feed_ask_04.mp3"
    },
    {
      "id": "feed_ask_05",
      "category": "activity_intro",
      "text_cs": "Mám veliký hlad! Dej mi prosím do misky přesně pět rybiček!",
      "karaoke_text": "MÁM VELIKÝ HLAD! DEJ MI PROSÍM DO MISKY PŘESNĚ 5 RYBIČEK!",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/feed_ask_05.mp3"
    },
    {
      "id": "feed_ask_06",
      "category": "activity_intro",
      "text_cs": "Mám veliký hlad! Dej mi prosím do misky přesně šest rybiček!",
      "karaoke_text": "MÁM VELIKÝ HLAD! DEJ MI PROSÍM DO MISKY PŘESNĚ 6 RYBIČEK!",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/feed_ask_06.mp3"
    },
    {
      "id": "feed_ask_08",
      "category": "activity_intro",
      "text_cs": "Mám veliký hlad! Dej mi prosím do misky přesně osm rybiček!",
      "karaoke_text": "MÁM VELIKÝ HLAD! DEJ MI PROSÍM DO MISKY PŘESNĚ 8 RYBIČEK!",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/feed_ask_08.mp3"
    },
    {
      "id": "feed_ask_09",
      "category": "activity_intro",
      "text_cs": "Mám veliký hlad! Dej mi prosím do misky přesně devět rybiček!",
      "karaoke_text": "MÁM VELIKÝ HLAD! DEJ MI PROSÍM DO MISKY PŘESNĚ 9 RYBIČEK!",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/feed_ask_09.mp3"
    },
    {
      "id": "feed_ask_12",
      "category": "activity_intro",
      "text_cs": "Mám veliký hlad! Dej mi prosím do misky přesně dvanáct rybiček!",
      "karaoke_text": "MÁM VELIKÝ HLAD! DEJ MI PROSÍM DO MISKY PŘESNĚ 12 RYBIČEK!",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/feed_ask_12.mp3"
    },
    {
      "id": "feed_ask_14",
      "category": "activity_intro",
      "text_cs": "Mám veliký hlad! Dej mi prosím do misky přesně čtrnáct rybiček!",
      "karaoke_text": "MÁM VELIKÝ HLAD! DEJ MI PROSÍM DO MISKY PŘESNĚ 14 RYBIČEK!",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/feed_ask_14.mp3"
    },
    {
      "id": "feed_ask_15",
      "category": "activity_intro",
      "text_cs": "Mám veliký hlad! Dej mi prosím do misky přesně patnáct rybiček!",
      "karaoke_text": "MÁM VELIKÝ HLAD! DEJ MI PROSÍM DO MISKY PŘESNĚ 15 RYBIČEK!",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+4%",
      "pitch": "+50Hz",
      "file": "assets/audio/feed_ask_15.mp3"
    },
    {
      "id": "feed_next_round",
      "category": "celebrate",
      "text_cs": "Mňam, výborně! Pojďme na další porci rybiček!",
      "karaoke_text": "MŇAM, VÝBORNĚ! POJĎME NA DALŠÍ PORCI RYBIČEK!",
      "intonation_note": "Zřetelně, hravě a přátelsky.",
      "voice": "cs-CZ-VlastaNeural",
      "rate": "+8%",
      "pitch": "+58Hz",
      "file": "assets/audio/feed_next_round.mp3"
    }
  ]
}
};
