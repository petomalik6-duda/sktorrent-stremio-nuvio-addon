# SKTorrent Katalógy – Stremio / Nuvio

Neoficiálny addon, ktorý číta najnovšie položky zo SKTorrentu a vytvára samostatné Stremio/Nuvio katalógy pre CZ/SK filmy, seriály, 4K/UHD a koncerty.

## Katalógy

1. 🆕 Novinky CZ/SK dabing – filmy
2. 🆕 Novinky CZ/SK dabing – seriály
3. 🇨🇿🇸🇰 Seriály – CZ/SK dabing
4. 💎 4K / UHD CZ/SK
5. 🎬 Filmové novinky
6. 🕒 Posledné pridané filmy
7. 🕒 Posledné pridané seriály
8. 🎤 Nové koncerty
9. 🎶 Posledné pridané koncerty
10. ✨ 4K / UHD koncerty

## Koncerty

- `Hudební videa` sa berú ako video koncertný/hudobný obsah.
- Pri kategórii `Hudba` sa vyžaduje kombinácia LIVE/CONCERT/TOUR/FESTIVAL + video kvalita/formát.
- FLAC/MP3/WAV/WavPack albumy sa do koncertných katalógov nezaradia.
- 4K/UHD koncerty vyžadujú 2160p, 4K alebo UHD v názve.

## Seriály

Seriály sa zobrazujú ako `series`, nie ako filmy. Addon zlučuje novšie torrenty podľa normalizovaného názvu seriálu. Pri otvorení detailu sa samostatné torrenty SxxEyy prevedú na epizódy a season packy sa po prihlásení rozbalia podľa názvov video súborov.

## Streamy

Pre stream je potrebné nastaviť SKTorrent cookie hodnoty `uid` a `pass`. Addon stiahne `.torrent`, vypočíta `infoHash` a Stremiu/Nuviu vráti `infoHash + fileIdx`.

## TMDB

TMDB API key je voliteľný. Ak je nastavený, detail filmu/seriálu sa obohatí o poster, background, český názov, popis a rok.

## Render

Repo obsahuje `render.yaml`. Po deployi otvor `/configure`, zadaj SKTorrent `uid`, `pass` a voliteľne TMDB API key a použi vygenerovaný manifest.

Používaj iba obsah, na ktorý máš právo/príslušné povolenie.
