# Ruhatár: natív Android és iOS alkalmazás

Ez **Expo / React Native forrásprojekt**, nem HTML-megjelenítő és nem telepíthető APK/IPA. Valódi natív kameranézetet, natív képkiválasztást, helyi adattárolást és QR-címkéket használ.

## Android APK elkészítése
1. Telepítsd a Node.js-t és az npm-et a számítógépedre.
2. A projekt könyvtárában: `npm install`
3. `npx eas-cli login` (Expo-fiók szükséges)
4. `npx eas-cli build:configure` (ha kéri)
5. `npx eas-cli build --platform android --profile preview`
6. A kapott APK-t töltsd le, és telepítsd Androidra.

## iPhone
Az iOS telepíthető buildjéhez Apple-fejlesztői aláírás és általában Apple Developer tagság szükséges. `npx eas-cli build --platform ios --profile production`, majd TestFlight / App Store terjesztés. Az Expo-fiók és az Apple-fiók beállítását a tulajdonosnak kell elvégeznie.

## Mit tud?
- Ruhák: fotó, név, méret, márka, ár, hely
- Egyedi R-0001 típusú sorszám, QR-kód
- Natív kamerás QR-beolvasás
- Készlet / eladott állapot, keresés
- Nyomtatható címke (nyomtatáshoz a sablon online QR könyvtárat használ, ezért internet szükséges)
- JSON biztonsági mentés fényképekkel, megosztás / visszatöltés

## Adatbiztonság
A helyi adatok nem felhőszinkronizáltak és nem végpontok között titkosítottak. Rendszeres biztonsági mentés szükséges. Az alkalmazás törlése adatvesztést okozhat. Az Android és iPhone között mentésfájllal lehet adatokat átvinni, automatikus közös készlet még nincs.

## Megjegyzés
A projekt forrását elkészítettük, de az APK/IPA buildet, valós eszközös tesztet és áruházi publikálást nem végeztük el. A csomagfüggőségek pontos verzióit a telepítéskor az Expo ellenőrizheti: `npx expo install --fix`.

## Felhőből indítható APK build (GitHub Actions)
A `.github/workflows/android-apk.yml` kézzel indítható build-folyamatot tartalmaz. A használatához szükséges egy Expo-fiók, a projekt EAS inicializálása (`eas init`), egy `EXPO_TOKEN` nevű GitHub Actions secret, és a forrás GitHub repóba feltöltése. Az első Android aláírókulcs létrehozása interaktív EAS konfigurációt igényelhet. Ezután a GitHub Actions „Android APK” workflow-ja indítható. A build eredménye az Expo EAS felületéről tölthető le, nem közvetlenül a GitHub Actions artifactjaiból.

**Állapot:** ebben a környezetben az npm registry nem volt elérhető, így függőségeket telepíteni, fordítani és APK-t ellenőrizni nem lehetett. A projektet valós telefonon még tesztelni kell.
