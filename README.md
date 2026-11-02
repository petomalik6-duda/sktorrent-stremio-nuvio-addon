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

## Priame HTTPS prehrávanie vo Wako (v2.1)

TorBox nie je podmienkou pre priame HTTPS zdroje. Správca môže na Renderi nastaviť
`DIRECT_STREAMS_JSON` ako JSON objekt s presnou identitou torrentu a súboru:

```json
{"0123456789abcdef0123456789abcdef01234567:0":"https://media.example.com/movie.mp4"}
```

Hodnota musí byť skutočná URL video dát dostupná prehrávaču, nie `.torrent`, magnet,
HTML detail alebo SKTorrent download endpoint. Zdroj musí fungovať bez SKTorrent
cookies a podporovať HTTP Range (206/416), HEAD a správny Content-Type; pre webové
prehrávače aj CORS. HTTPS nezaručuje kompatibilitu kodeku s iOS. MP4 dostane
`notWebReady:false`, ostatné kontajnery konzervatívne `true`. Žiadne automatické
transkódovanie ani overenie dostupnosti sa nevykonáva. Za správnosť a platnosť URL
zodpovedá správca. URL sa sprístupní klientom addonu: používajte len zdroje, ktoré
im smiete sprístupniť. Nepoužívajte v URL trvalé heslá alebo tracker passkey.

Pre zhodný `infoHash:fileIdx` addon pridá samostatný `url` stream na začiatok odpovede;
pôvodné torrentové streamy zostávajú v pôvodnom poradí aj so všetkými poľami.
Funguje pre štandardné filmy, epizódy, lokálne koncerty aj People bridge, pretože sa
upravuje finálna odpoveď stream handlera. Použite existujúci nakonfigurovaný manifest;
nie je potrebný nový účet ani Wako špecifický token. Wako musí vybrať položku HTTPS.
Ak nemá zdroj nakonfigurovanú HTTPS URL, dostane pôvodný torrentový zdroj a stále
potrebuje vlastný torrent engine alebo resolver. Nová verzia sama nevytvára HTTP
video z torrentu a nezaručuje prehrávanie všetkých SKTorrent položiek bez debridu.

Prázdny register je predvolený. Nastavenie sa načíta pri štarte; po zmene treba deploy.
Chybná konfigurácia zastaví štart s chybou bez vypísania URL. Verejný diagnostický
endpoint `/debug/http-stream-contract` ukazuje iba zapnutie podpory, bez URL a kľúčov.
`npm test` pokrýva mapovanie, poradie, fallback, hinty a odmietnutie chybných vstupov;
CI navyše spúšťa HTTP probe reálneho servera.

### Zistenia a návrh torrent → HTTP gateway

Aktívny server vzniká spojením `server-v4.part1.js` až `part29.js`. Efektívne
`downloadTorrentBuffer`/`torrentData` v part5 a request coalescing v part23 sťahujú
`.torrent` s guest alebo SKTorrent autentifikáciou. `bncode` dekóduje info dictionary,
SHA-1 sa počíta z jej opätovného zakódovania a indexy súborov zostávajú v poradí
metainfo. Výber epizódy sa vykonáva pred `makeStream`. Video dáta sa nesťahujú.
Existujúci výpočet hash a výber súborov táto zmena nemení. Pri budúcej úprave parsera
je vhodné hashovať pôvodné bajty info dictionary (nekanonický bencode môže mať iný
hash po re-encodingu); treba zachovať samostatné fixtures a testy kompatibility.

Pre všeobecné prehrávanie torrentov bez cloudu treba samostatný vlastný torrentový
server. Navrhovaný kontrakt: autentifikovaný control endpoint prijme overené metainfo,
vybraný index a používateľské oprávnenie; vráti krátkodobú podpísanú HTTPS URL
`/media/<opaque-session>/<fileIdx>?expires=...&signature=...`. Podpis musí viazať
používateľa, hash, index aj expiráciu. Media endpoint overí podpis, prístup a presný
súbor, obslúži GET/HEAD a jediný byte Range bez načítania celého videa do RAM.
Zaviesť limity súbehu, disku, prenosu a životnosti session, timeout čakania na peers,
čistenie po odpojení a SIGTERM, ochranu tracker passkey a redakciu logov.

Gateway nesmie prijímať ľubovoľný upstream URL/path od prehrávača. Control vrstva
musí zakázať SSRF cez tracker aj webseed URL, privátne/link-local/metadata adresy,
DNS rebinding a presmerovania; tiež path traversal a symlinky v torrent súboroch.
Privátny tracker vyžaduje rešpektovanie private flagu a pravidiel DHT/PEX/seeding.
Až reálne pripravenú session možno inzerovať ako HTTP stream; zlyhanie gateway musí
ponechať pôvodný torrentový fallback. Trvalá torrent gateway sa týmto deployom
nezavádza: existujúca Render služba je free web bez torrent engine a vyhradeného
úložiska. Nevytvárame ďalšie platené zdroje. Existujúca vlastná gateway/CDN môže
svoje stabilné video URL dodávať do vyššie uvedeného registra.

## Voliteľný režim Wako (2.2.0, overovanie kompatibility)

K existujúcej adrese manifestu pridaj `/wako` hneď za hostiteľa:

```text
https://HOST/KONFIGURACNY_TOKEN/manifest.json
https://HOST/wako/KONFIGURACNY_TOKEN/manifest.json
```

Osobný token zostáva rovnaký a netreba ho nikam zdieľať. V aplikácii sa režim
zobrazí ako **SKTorrent Katalógy • Wako** s oddelenou identitou doplnku.
Bežný manifest pre Nuvio/Stremio sa nemení.

Režim poskytne TMDB filmu kartu `sktmovie671575` bez dvojbodky, ale predvolené
video a jeho `videos[].id` ponechá `tmdb:671575`. Ostatné nainštalované zdrojové
addony tak môžu dostať pôvodné spoločné video ID. Metadata obsahujú explicitný
filmový typ a numerické TMDB ID. Seriály, IMDb identity a koncerty bez bezpečného
TMDB párovania zostávajú nezmenené. Žiadny účet iného addonu sa na server nepridáva.

Alias požiadavky sa na serveri bezpečne prevedú na pôvodný movie/TMDB handler.
Stream odpovede vrátane `infoHash + fileIdx` zostávajú nezmenené. Režim nepridáva
torrentový engine ani neodstraňuje potrebu resolvera pri výbere torrentového zdroja.

Jednotkové a HTTP regresné testy overujú izoláciu režimu, zachovanie osobného
konfiguračného tokenu, spoločného video ID a pôvodného manifestu. Úspešné testy
servera samy nepotvrdzujú, že konkrétna verzia Wako zachová movie typ aj pri volaní
ostatných addonov; rozhodujúce je overenie v aplikácii.
