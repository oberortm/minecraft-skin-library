# Minecraft Skin Library

Persönliche Minecraft-Skin-Bibliothek im Browser: Skins per Drag & Drop sammeln, in 3D ansehen und selbst zeichnen. Alles bleibt lokal gespeichert, ohne Login und ohne Server.

**Live:** https://oberortm.github.io/minecraft-skin-library/

*English below.*

## Funktionen

- **Importieren:** PNG-Skins per Drag & Drop oder Dateiauswahl, auch viele auf einmal. Unterstützt 64×64 und das alte Format 64×32. Doppelte Skins werden erkannt.
- **Bibliothek:** Vorder-, Rück- und Texturansicht, Filter nach Slim/Classic und Favoriten, Suche und Sortierung.
- **Detailansicht:** Drehbare 3D-Figur mit Laufanimation, Textur mit beschrifteten Bereichen, Name, Notizen, Favorit.
- **Editor:** Direkt auf die Textur oder auf die Vorder- und Rückseite der Figur malen. Stift, Radierer, Füllen (bleibt in der jeweiligen Fläche), Pipette, Basis- und Außen-Ebene, Slim/Classic, Rückgängig und Wiederholen, Live-3D-Vorschau. Neuer Skin startet auf einer neutralen Vorlage.
- **Export:** Jeder Skin als PNG, dazu ein Hinweis, welches Spielermodell du im Launcher wählen musst.
- **Backup:** Die ganze Bibliothek als JSON-Datei speichern und auf einem anderen Gerät wieder laden.
- **5 Looks**, jeweils hell und dunkel: Standard, Studio und Prism (beide mit 3D-Figuren und Scroll-Animationen), Minecraft (vor einer generierten Pixel-Landschaft) und Exhibition.
- Englisch (Standard) und Deutsch.

### Tastenkürzel im Editor

| Taste | Werkzeug |
| --- | --- |
| `B` | Stift |
| `E` | Radierer |
| `G` | Füllen |
| `I` | Pipette |
| `Strg`/`Cmd` + `Z` | Rückgängig |
| `Strg`/`Cmd` + `Y` oder `Shift` + `Z` | Wiederholen |

## Datenschutz

Skins werden nur in deinem Browser gespeichert (IndexedDB). Es gibt keinen Server, kein Konto und keine Analyse. Wenn du die Browserdaten löschst, ist die Bibliothek weg. Mach dir also ab und zu ein Backup.

## Selbst starten

Es gibt keinen Build-Schritt. Weil die Seite ES-Module nutzt, braucht sie einen kleinen lokalen Server:

```bash
git clone https://github.com/oberortm/minecraft-skin-library.git
cd minecraft-skin-library
python3 -m http.server 8000
```

Dann http://localhost:8000 öffnen.

## Aufbau

```
index.html          Seite, Dialoge
css/style.css       Grundlayout und Standard-Look
css/looks.css       Die anderen Looks (je hell und dunkel)
js/app.js           Bibliothek, Import, Detailansicht, Backup
js/editor.js        Skin-Editor
js/skin.js          Skin-Geometrie, Rendering, Formatumwandlung
js/fig3d.js         3D-Figuren aus CSS-Boxen (ohne WebGL, für die 3D-Looks)
js/motion.js        Scroll-Fly-ins, Tilt, Titel-Animation
js/mcscene.js       Generierte Pixel-Landschaft für den Minecraft-Look
js/looks.js         Look-Umschaltung
js/db.js            Speicher (IndexedDB)
js/i18n.js          Texte auf Deutsch und Englisch
vendor/skinview3d   3D-Ansicht (MIT-Lizenz)
```

## Ideen für später

- Skin direkt im Minecraft-Konto setzen (braucht Microsoft-Login, eine von Mojang freigegebene App und einen kleinen Server)
- Spiegeln beim Zeichnen (linke und rechte Seite gleichzeitig)
- Malen direkt am 3D-Modell

## Lizenz

MIT, siehe [LICENSE](LICENSE). Die 3D-Ansicht nutzt [skinview3d](https://github.com/bs-community/skinview3d) (MIT).

Dieses Projekt ist nicht offiziell und steht in keiner Verbindung zu Mojang oder Microsoft. „Minecraft“ ist eine Marke von Mojang Synergies AB. Es werden keine Grafiken oder Schriften aus dem Spiel verwendet; die Landschaft im Minecraft-Look wird zufällig generiert.

---

## English

A personal Minecraft skin library that runs entirely in your browser. Drop in PNG skins (64×64 or legacy 64×32), browse them front, back or as a texture, view them in 3D, draw your own in the built-in editor and export them as PNG. Everything is stored locally in IndexedDB; use the backup file to move your library to another device. Five looks (Standard, Studio, Prism, Minecraft, Exhibition), each with light and dark mode. No build step: serve the folder with any static server.

Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.
