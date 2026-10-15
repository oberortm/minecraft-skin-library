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
- **Präsentationsmodus:** Ein Skin bildschirmfüllend in 3D, mit Pfeilen, Tastatur (← →) oder Wischen weiterblättern. Fünf Szenen mit eigener Beleuchtung (Studio, Spotlight, Golden hour, Neon, Moonlight), Animationen (Stehen, Gehen, Rennen, Fliegen), Drehen, Vollbild. Das Menü versteckt sich und kommt über den Menü-Button oben links zurück.
- **Oberfläche:** Ein klarer Look mit 3D-Figuren in den Karten, Hell/Dunkel und Englisch/Deutsch per Knopfdruck im Header.

### Tastenkürzel im Editor

| Taste | Werkzeug |
| --- | --- |
| `B` | Stift |
| `E` | Radierer |
| `G` | Füllen |
| `I` | Pipette |
| `Strg`/`Cmd` + `Z` | Rückgängig |
| `Strg`/`Cmd` + `Y` oder `Shift` + `Z` | Wiederholen |

### Tastenkürzel in der Präsentation

| Taste | Aktion |
| --- | --- |
| `←` / `→` | Vorheriger / nächster Skin |
| `Leertaste` | Drehen an/aus |
| `1`–`5` | Szene wählen |
| `M` | Menü einblenden |
| `Esc` | Präsentation beenden |

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

## Neue Version veröffentlichen (Cache-Busting)

GitHub Pages lässt Browser Dateien bis zu 10 Minuten cachen. Damit nie altes und neues JavaScript gemischt wird, hängt an jeder CSS- und JS-URL eine Versionsnummer (`?v=5`). Alles steht in **einer** Datei, `index.html`: Stylesheets, Skripte und die Import-Map, die jedem Modul genau eine versionierte URL gibt (so entstehen keine doppelten Modul-Instanzen).

**Bei jedem Release die Nummer erhöhen**, z. B. von 5 auf 6:

```bash
sed -i 's/?v=5"/?v=6"/g; s/name="app-version" content="5"/name="app-version" content="6"/' index.html
```

Neue Module in `js/` müssen zusätzlich in der Import-Map in `index.html` eingetragen werden. Startet ein Teil der App nicht (fehlendes Element, Fehler), laufen die anderen Knöpfe weiter und es erscheint ein Hinweis statt einer toten Seite.

## Aufbau

```
index.html          Seite, Dialoge
css/style.css       Grundlayout
css/looks.css       Studio-Look (hell und dunkel)
css/present.css     Präsentationsmodus und Szenen
js/app.js           Bibliothek, Import, Detailansicht, Backup
js/editor.js        Skin-Editor
js/skin.js          Skin-Geometrie, Rendering, Formatumwandlung
js/fig3d.js         3D-Figuren aus CSS-Boxen für die Karten (ohne WebGL)
js/motion.js        Einblenden beim Scrollen, Titel-Animation
js/present.js       Präsentationsmodus
js/db.js            Speicher (IndexedDB)
js/dom.js           Fehlertolerante DOM-Helfer für den Start
js/i18n.js          Texte auf Deutsch und Englisch
vendor/skinview3d   3D-Ansicht (MIT-Lizenz)
```

## Ideen für später

- Skin direkt im Minecraft-Konto setzen (braucht Microsoft-Login, eine von Mojang freigegebene App und einen kleinen Server)
- Spiegeln beim Zeichnen (linke und rechte Seite gleichzeitig)
- Malen direkt am 3D-Modell

## Lizenz

MIT, siehe [LICENSE](LICENSE). Die 3D-Ansicht nutzt [skinview3d](https://github.com/bs-community/skinview3d) (MIT).

Dieses Projekt ist nicht offiziell und steht in keiner Verbindung zu Mojang oder Microsoft. „Minecraft“ ist eine Marke von Mojang Synergies AB. Es werden keine Grafiken oder Schriften aus dem Spiel verwendet.

---

## English

A personal Minecraft skin library that runs entirely in your browser. Drop in PNG skins (64×64 or legacy 64×32), browse them front, back or as a texture, view them in 3D, draw your own in the built-in editor and export them as PNG. Everything is stored locally in IndexedDB; use the backup file to move your library to another device. Includes a full-screen presentation mode with lit scenes and animations, plus light/dark and English/German toggles. No build step: serve the folder with any static server.

Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.
