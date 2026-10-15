# Minecraft Skin Library

Persönliche Minecraft-Skin-Bibliothek im Browser: Skins per Drag & Drop sammeln, in 3D ansehen und selbst zeichnen. Alles bleibt lokal gespeichert, ohne Login und ohne Server.

**Live:** https://oberortm.github.io/minecraft-skin-library/

*English below.*

## Funktionen

- **Importieren:** PNG-Skins per Drag & Drop oder Dateiauswahl, auch viele auf einmal. Unterstützt 64×64 und das alte Format 64×32. Doppelte Skins werden erkannt.
- **Bibliothek:** Vorder-, Rück- und Texturansicht, kombinierbare Filter (Slim, Classic und Favoriten zusammen wählbar, z. B. nur Slim-Favoriten; „All“ setzt zurück), Suche und Sortierung.
- **Detailansicht:** Drehbare 3D-Figur mit Laufanimation, Textur mit beschrifteten Bereichen, Name, Notizen, Favorit.
- **Editor:** Standardmäßig malst du direkt auf der großen, drehbaren 3D-Figur; ein Rahmen zeigt den Pixel unter dem Mauszeiger. Umschaltbar auf die Textur-Ansicht (64×64 plus flache Vorder- und Rückseite), beide arbeiten auf derselben Textur mit gemeinsamem Rückgängig/Wiederholen. Deckkraft-Regler für die Farbe (Halbtransparenz zeigt Minecraft nur auf der Außenebene), Stift, Radierer, Rausch-Pinsel (malt die Farbe in zufälligen helleren und dunkleren Abstufungen, Stärke per Regler), Füllen (bleibt in der jeweiligen Fläche), Verlauf (zweites Farbfeld, von Farbe 1 nach Farbe 2 ziehen, füllt die Fläche unter dem Startpunkt), Pipette, Drehen, Spiegeln (links und rechts gleichzeitig). Basis- und Außen-Ebene lassen sich mit den Knöpfen „Basis“ und „Außenebene“ einzeln ein- und ausblenden; du wählst, auf welche Ebene du malst. Ist die Außen-Ebene ausgeblendet, malst du auf die Basis darunter. Ein kleines Männchen schaltet einzelne Körperteile (Kopf, Körper, Arme, Beine) in 3D aus, so kommst du an verdeckte Stellen wie die Körperseite unter dem Arm; in der Textur-Ansicht bleiben sie abgedunkelt bemalbar. Slim/Classic, neuer Skin startet auf einer neutralen Vorlage.
- **Export:** Jeder Skin als PNG, dazu ein Hinweis, welches Spielermodell du im Launcher wählen musst.
- **Backup:** Die ganze Bibliothek als JSON-Datei speichern und auf einem anderen Gerät wieder laden.
- **Präsentationsmodus:** Ein Skin bildschirmfüllend in 3D, mit Pfeilen, Tastatur (← →) oder Wischen weiterblättern. Zwei Szenen-Gruppen, umschaltbar über „Classic | Minecraft“:
  - *Classic:* Studio (weiß), Spotlight (schwarz), Golden hour (Sonnenuntergang), Moonlight (Nacht) als Bühnen-Hintergründe.
  - *Minecraft:* dieselben vier Stimmungen als echte 3D-Blockwelt, in der der Skin steht: weißer Raum als nahtloses Fotostudio mit Lichtpaneelen in der Decke, derselbe Raum dunkel und nur vom Lichtkegel beleuchtet, Sonnenaufgang und Nacht in einer Hügellandschaft mit freier Lichtung, drei Bäumen und einem See, in dem sich Sonne bzw. Mond spiegeln (beide stehen beim Start schräg links hinter dem Skin); nachts nur Mond- und Sternenlicht. Die Kamera bleibt beim Herauszoomen und Drehen immer vor den Blöcken. Weiche Echtzeit-Schatten, ACES-Tonemapping, Nebel, Himmelsverlauf, Bloom, volumetrisches Licht (Lichtstrahlen von Sonne bzw. Mond, die von Figur und Bäumen unterbrochen werden) spiegelndes Wasser mit Wellen und weiche Umgebungsverschattung (Ecken und Kanten zwischen Blöcken werden sanft dunkler, wie „Smooth Lighting“). Standardmäßig sind alle Texturen selbst gezeichnet (im Code erzeugt, Vanilla-Stil); die Seite liefert keine Spielgrafiken mit. Im Zahnrad-Menü (nur Minecraft-Gruppe) wählst du unter „Texturen“: Eingebaut, Minecraft Standard, Faithful 32x, Bare Bones, Stay True oder eine eigene .zip. Erst bei Auswahl lädt dein Browser die Originale einmalig direkt von der offiziellen Quelle (Mojangs Spieldateien bzw. Modrinth, mit Ladebalken) und speichert nur die benötigten Bilder lokal; nichts davon ist Teil dieser Website. Klappt ein Download nicht, erscheint ein Link zur offiziellen Seite, dann kannst du das Pack dort laden und als eigene Datei wählen. Fehlende Blöcke nutzen die eingebauten Texturen. Qualität „Hoch“ (Bloom, Lichtstrahlen, spiegelndes Wasser, feinere Schatten) oder „Niedrig“: Ohne eigene Wahl entscheidet die Seite (Handys und schwache Geräte starten auf Niedrig, bei ruckelnder Darstellung wird heruntergeschaltet); im Zahnrad-Menü kannst du die Stufe selbst festlegen, sie wird gemerkt.
  
  Animationen (Stehen, Gehen, Rennen, Fliegen), Drehen, Vollbild. Über den Knopf „Ausrüstung“ legst du der Figur eine Elytra an; „Fliegen“ zieht sie automatisch an, wie im Spiel. Dort gibt es auch Rüstung: Helm, Brustpanzer, Hose und Stiefel einzeln aus Leder (frei färbbar), Kette, Eisen, Gold, Kupfer, Diamant oder Netherit, jeweils mit Rüstungsbesatz (18 Muster, 11 Materialien) und Verzauberungsschimmer; „Alles gleich“ überträgt das zuletzt geänderte Teil auf alle vier. Elytra und Brustpanzer schließen sich aus. Die Rüstungstexturen sind selbst gezeichnet; mit „Minecraft Standard“ oder einem Pack als Texturquelle werden dessen Originale samt echter Besatz-Farbpaletten verwendet. Die Ausrüstung gilt für alle Skins und wird gemerkt. Gruppe und Szene werden gemerkt. Das Menü versteckt sich und kommt über den Menü-Button oben links zurück; geschlossen wird es mit ✕, einem Klick in die Szene, Esc oder automatisch, sobald die Maus deutlich nach unten weggeht.
- **Oberfläche:** Ein klarer Look mit 3D-Figuren in den Karten, Hell/Dunkel und Englisch/Deutsch per Knopfdruck im Header.

### Tastenkürzel im Editor

| Taste | Werkzeug |
| --- | --- |
| `B` | Stift |
| `E` | Radierer |
| `N` | Rausch-Pinsel |
| `G` | Füllen |
| `V` | Verlauf |
| `I` | Pipette |
| `R` | Drehen (linke Maustaste dreht statt zu malen) |
| `M` | Spiegeln an/aus |
| `Leertaste` halten + Ziehen | Figur drehen (3D) |
| Rechte Maustaste + Ziehen | Figur drehen (3D) |
| Mausrad | Zoomen (3D) |
| `Strg`/`Cmd` + `Z` | Rückgängig |
| `Strg`/`Cmd` + `Y` oder `Shift` + `Z` | Wiederholen |

Auf dem Handy malt ein Finger, zwei Finger drehen und zoomen.

### Tastenkürzel in der Präsentation

| Taste | Aktion |
| --- | --- |
| `←` / `→` | Vorheriger / nächster Skin |
| `Leertaste` | Drehen an/aus |
| `1`–`4` | Szene der aktuellen Gruppe wählen |
| `G` | Gruppe wechseln (Classic / Minecraft) |
| `M` | Menü einblenden (`Esc` schließt es wieder) |
| Linke Maustaste ziehen / 1 Finger | Skin drehen |
| Rechte Maustaste ziehen / 2 Finger | Kamera drehen (2 Finger: auch zoomen) |
| Mausrad | Zoomen |
| `H` | Bedienelemente aus-/einblenden (auch per Knopf; Maus bewegen holt sie zurück) |
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

GitHub Pages lässt Browser Dateien bis zu 10 Minuten cachen. Damit nie altes und neues JavaScript gemischt wird, hängt an jeder CSS- und JS-URL eine Versionsnummer (`?v=N`, die aktuelle steht in `<meta name="app-version">`). Alles steht in **einer** Datei, `index.html`: Stylesheets, Skripte und die Import-Map, die jedem Modul genau eine versionierte URL gibt (so entstehen keine doppelten Modul-Instanzen).

**Bei jedem Release die Nummer erhöhen:**

```bash
ALT=$(grep -o 'app-version" content="[0-9]*' index.html | grep -o '[0-9]*$'); NEU=$((ALT+1))
sed -i "s/?v=$ALT\"/?v=$NEU\"/g; s/app-version\" content=\"$ALT\"/app-version\" content=\"$NEU\"/" index.html
```

Neue Module in `js/` müssen zusätzlich in der Import-Map in `index.html` eingetragen werden. Die Bibliotheken in `vendor/` tragen ihre Version im Ordnernamen; skinview3d und der eigene Code holen sich `three` über dieselbe Import-Map-Zeile, damit nie zwei three.js-Kopien geladen werden. Startet ein Teil der App nicht (fehlendes Element, Fehler), laufen die anderen Knöpfe weiter und es erscheint ein Hinweis statt einer toten Seite.

## Aufbau

```
index.html          Seite, Dialoge
css/style.css       Grundlayout
css/looks.css       Studio-Look (hell und dunkel)
css/present.css     Präsentationsmodus und Szenen
js/app.js           Bibliothek, Import, Detailansicht, Backup
js/editor.js        Skin-Editor
js/paint3d.js       Malen auf der 3D-Figur (Raycast -> UV -> Texturpixel)
js/view3d.js        Lädt die 3D-Engine bei Bedarf
js/skin.js          Skin-Geometrie, Rendering, Formatumwandlung
js/fig3d.js         3D-Figuren aus CSS-Boxen für die Karten (ohne WebGL)
js/motion.js        Einblenden beim Scrollen, Titel-Animation
js/present.js       Präsentationsmodus
js/pack.js          Textur-Quellen: Download (Mojang/Modrinth), ZIP lesen, lokal speichern
js/equipment.js     Ausrüstung der Figur (Elytra, Rüstung, Items) und eigene Texturen dafür
js/mcworld.js       Minecraft-Szenen: Blockwelt, Licht, Schatten, Nebel, Bloom (nur bei Bedarf geladen)
js/db.js            Speicher (IndexedDB)
js/dom.js           Fehlertolerante DOM-Helfer für den Start
js/i18n.js          Texte auf Deutsch und Englisch
vendor/skinview3d@3.0.1     3D-Figur (ES-Module, MIT-Lizenz)
vendor/skinview-utils@0.7.1 Hilfsfunktionen von skinview3d (MIT-Lizenz)
vendor/three@0.156.1        three.js r156, die einzige three.js-Kopie (MIT-Lizenz)
```

## Ideen für später

- Skin direkt im Minecraft-Konto setzen (braucht Microsoft-Login, eine von Mojang freigegebene App und einen kleinen Server)

## Lizenz

MIT, siehe [LICENSE](LICENSE). Die 3D-Ansicht nutzt [skinview3d](https://github.com/bs-community/skinview3d) und [three.js](https://threejs.org) (beide MIT, Lizenzdateien in `vendor/`).

Dieses Projekt ist nicht offiziell und steht in keiner Verbindung zu Mojang oder Microsoft. „Minecraft“ ist eine Marke von Mojang Synergies AB. Es werden keine Grafiken oder Schriften aus dem Spiel verwendet.

---

## English

A personal Minecraft skin library that runs entirely in your browser. Drop in PNG skins (64×64 or legacy 64×32), filter them (Slim, Classic and favourites combine), view them in 3D and export them as PNG. The editor paints directly on the 3D figure or on the flat texture, with pencil, eraser, noise brush, fill, gradient, picker, mirroring, separate base/outer layers and body parts you can hide to reach covered spots. Everything is stored locally in IndexedDB; use the backup file to move your library to another device.

The presentation mode has two scene groups: Classic backdrops, and Minecraft-style 3D block worlds (white room, dark stage, sunrise island, moonlit night) with real-time shadows, ACES tone mapping, fog, bloom, light shafts, reflective water and soft ambient occlusion. All built-in block textures are generated in code; you can optionally load your own resource pack (.zip), which stays in your browser. A High/Low quality switch keeps it smooth on phones. The "Equipment" button dresses the figure: an elytra (needed for flying) and armor per piece (leather with any dye, chainmail, iron, gold, copper, diamond, netherite) with armor trims and enchantment glint, drawn in code or taken from the selected texture source. Light/dark and English/German toggles are in the header.

No build step: serve the folder with any static server. Every CSS/JS URL carries a version (`?v=N`, set in `index.html`); raise it on each release so browsers never mix cached old and new files.

Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.
