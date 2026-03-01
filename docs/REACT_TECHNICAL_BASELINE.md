# RouteBench — Dokumentacja techniczna (wersja bazowa React)

## 1. Cel aplikacji
RouteBench Studio to webowa aplikacja benchmarkująca wiele heurystyk trasowania (wariant TSP/VRP single-route) na wspólnym zestawie punktów i konfiguracji scenariusza. Główny cel:
- porównanie jakości tras (dystans, ETA),
- porównanie kosztu obliczeń (ms),
- szybkie testy „co jeśli” dla scenariuszy operacyjnych,
- eksport wyników do CSV.

Aplikacja działa w trzech niezależnych przestrzeniach roboczych (tabs/workspaces), dzięki czemu można porównać różne zbiory danych i konfiguracje bez resetowania poprzedniego kontekstu.

---

## 2. Architektura wysokiego poziomu

### 2.1 Warstwy
1. **Warstwa UI (React + Tailwind + Leaflet)**
   - `App.tsx` — shell aplikacji, top nav, zakładki workspace.
   - `components/RouteWorkspace.tsx` — orchestrator benchmarku, import/export, konfiguracja i rendering paneli wyników.
   - `components/TunerPanel.tsx` — strojenie solvera + scenariusze.
   - `components/AddressInput.tsx` — wyszukiwarka adresów (Nominatim).
   - `components/MapPanel.tsx` — karta wyniku algorytmu + mini-mapa trasy.

2. **Warstwa domenowa / algorytmiczna**
   - `services/solverService.ts` — heurystyki trasowania, metryki, integracja OSRM.

3. **Warstwa danych / importu**
   - `services/importService.ts` — parsowanie CSV/TXT do modelu `Stop`.
   - `constants.ts` — dane startowe (default points i domyślny dataset stopów).

4. **Kontrakty typów**
   - `types.ts` — modele, konfiguracje, enum algorytmów i kształt wyników.

### 2.2 Przepływ danych (end-to-end)
1. Użytkownik ładuje punkty (domyślne lub import CSV).
2. Użytkownik konfiguruje parametry solvera i scenariusze.
3. `RouteWorkspace.runBenchmarks()`:
   - pobiera macierz odległości OSRM (table API),
   - tworzy cost function (OSRM fallback do Haversine),
   - uruchamia wszystkie algorytmy sekwencyjnie,
   - zapisuje wyniki bazowe,
   - opcjonalnie dogrywa geometrię dróg OSRM route API dla każdej unikalnej sygnatury trasy,
   - aktualizuje metryki (real road distance + ETA/duration).
4. `MapPanel` renderuje trasę i statystyki.
5. Użytkownik może dodać ocenę manualną i wyeksportować CSV.

---

## 3. Modele i kontrakty domenowe

### 3.1 Encje główne
- **Coordinate** `{lat, lng}`
- **Stop** `{id, address, city, coordinates, notes?}`
- **RouteStats** `{distanceKm, calculationTimeMs, algorithmName, isRoadData?, eta?, durationMinutes?}`
- **RouteResult** `{path, stats, geometry?}`

### 3.2 Konfiguracje
- **SolverConfig**
  - Clustering/repair: `enableClustering`, `clusterCount`, `repairWindow`
  - Local search: `enableLocalSearch`, `twoOptIterations`, `threeOptIterations`
  - SA: `saTemp`, `saCooling`
  - Genetic: `enableGenetic`, `gaPopulation`, `gaGenerations`, `gaMutationRate`, `gaElitism`
  - U-turn: `enableUTurn`, `uTurnAlternativeDist`, `uTurnReward`

- **ScenarioConfig**
  - `traffic`, `rain`, `snow`, `fog`, `night`, `vip`, `truck`, `highway`, `urban`, `emergency`

### 3.3 Enum algorytmów
Model enum zawiera szerszy katalog algorytmów niż aktywnie benchmarkowane na UI. Na ekranie benchmarku aktywne są m.in.:
- Original Order
- NN + 2-Opt
- Farthest Insertion
- NN + 3-Opt
- Simulated Annealing
- Cluster, Anchor & Farthest
- Farthest + Street Repair
- Farthest + Directional Flow
- Cheapest Insertion
- Clarke & Wright Savings
- Hilbert Space-Filling Curve
- Convex Hull Insertion

---

## 4. UI i odpowiedzialności komponentów

### 4.1 `App.tsx`
- utrzymuje `activeTab` i `visitedTabs` (lazy mounting workspace),
- renderuje top bar + status ONLINE,
- renderuje 3 przestrzenie robocze (`RouteWorkspace`) i zachowuje ich stan po odwiedzeniu.

### 4.2 `RouteWorkspace.tsx`
**Orkiestrator funkcjonalny aplikacji:**
- stan wejściowy: start, end, lista stopów,
- stan konfiguracji: solver + scenariusze,
- stan wykonania: `isProcessing`, `status`, `results`, `previousResults`, `ratings`,
- import CSV/TXT,
- eksport wyników do CSV z auto-score,
- uruchamianie benchmarku i dogrywanie geometrii.

### 4.3 `AddressInput.tsx`
- autocomplete przez Nominatim,
- geolokalizacja użytkownika jako bias, jeśli brak `referencePoint`,
- mechanizm fallback query (np. „ulica 36” + „ulica”),
- dropdown sugestii + wybór i mapowanie do `Stop`.

### 4.4 `TunerPanel.tsx`
- presety + zaawansowany panel sliderów i toggle,
- oddziela grupy: Clustering, Local Search, Genetic, U-Turn, Scenarios,
- aktualizuje configi przez callbacki do rodzica.

### 4.5 `MapPanel.tsx`
- karta pojedynczego wyniku algorytmu,
- metryki + delta względem poprzedniego benchmarku,
- mapa Leaflet + polyline,
- zoptymalizowane markery (culling >200 punktów i różnicowe aktualizacje),
- manualna ocena 1–10.

---

## 5. Integracje zewnętrzne

### 5.1 Nominatim (OpenStreetMap)
- endpoint `search` dla sugestii adresowych,
- query debounce 500 ms,
- `viewbox + bounded=1` dla lokalnego biasu.

### 5.2 OSRM
1. **Table API** — macierz odległości (metry -> km) dla dokładniejszego costFn.
2. **Route API** — geometria i road-distance dla gotowej kolejności punktów.

### 5.3 Strategie awaryjne
- brak OSRM matrix => fallback Haversine,
- brak road geometry => zostaje polyline po punktach,
- brak geolokalizacji => brak bias user location.

---

## 6. Logika benchmarku i metryki

### 6.1 Pipeline benchmarku
1. snapshot poprzednich wyników (`previousResults`),
2. deduplikacja punktów po `id` (matrix request),
3. budowa `baseCostFn`,
4. budowa `scenarioCostFn` (modyfikator kosztu),
5. uruchomienie algorytmów i pomiar `performance.now()`,
6. zapis `tempResults`,
7. dogranie road geometry + aktualizacja dystansu/ETA,
8. reset statusu.

### 6.2 ETA i duration
- bazuje na dystansie, liczbie punktów i aktywnych scenariuszach,
- renderowane jako `Xh Ym` + delta minut.

### 6.3 CSV Export
- delimiter `;` (Excel-friendly EU),
- BOM UTF-8,
- pola: Nazwa, Dystans, Calc, ETA, Ocena Auto (1-10), Ocena Manualna, Sceneria,
- auto-score = `(bestDistance / thisDistance) * 10`.

---

## 7. Wydajność i UX
- lazy render workspaces (`visitedTabs`) ogranicza koszt pierwszego paint,
- marker culling tylko dla dużych tras (powyżej 200),
- signature cache geometrii tras ogranicza duplikaty requestów,
- statusy progresu zwiększają „perceived responsiveness”,
- dark UI i modularne karty poprawiają czytelność porównania.

---

## 8. Ograniczenia i ryzyka
1. Brak warstwy backend (rate-limit API publicznych).
2. Prosty parser CSV (może nie obsłużyć skomplikowanego quoting).
3. Publiczne endpointy OSRM/Nominatim mogą zwracać niestabilne czasy.
4. Brak testów automatycznych (logika heurystyk bez harnessa testowego).
5. Część klas Tailwinda dynamiczna (`bg-${color}-...`) wymaga kontroli przy buildach produkcyjnych.

---

## 9. Minimalna lista testów regresji (manualnych)
1. Załaduj appkę, sprawdź autostart benchmarku w Workspace #1.
2. Zmień start/end, uruchom benchmark, zweryfikuj aktualizację wszystkich kart.
3. Import CSV (różne separatory), sprawdź liczbę stopów.
4. Włącz scenariusze (`traffic`, `snow`) i porównaj ETA/dystans.
5. Ustaw oceny manualne i wyeksportuj CSV — sprawdź zawartość.
6. Przełącz zakładki i wróć — stan powinien się utrzymać.

---

## 10. Definicja „parytetu 1:1” przy migracji
Migrację uznajemy za zgodną, gdy:
- każdy workflow użytkownika React działa identycznie w Flutter,
- te same algorytmy i kolejność benchmarku są dostępne,
- metryki i format eksportu są zgodne w granicach tolerancji liczbowej,
- UI i hierarchia informacji są równoważne (desktop + mobile),
- fallbacki i obsługa błędów zachowują ten sam sens biznesowy.
