# RouteBench — Blueprint migracji React -> Flutter (1:1, production-grade)

## Status analizy repozytoriów
- **Repo React (`routebench-react-final`)**: przeanalizowane lokalnie, komponent po komponencie.
- **Repo Flutter (`routeBench_remix_flutt`)**: w tym środowisku nie udało się pobrać z GitHub (błąd sieci `CONNECT tunnel failed, response 403`).

> Wniosek: poniższy blueprint opiera się na pełnej analizie aplikacji React i jest przygotowany jako docelowa specyfikacja odtworzenia 1:1 we Flutterze. Gdy tylko repo Flutter będzie lokalnie dostępne, można od razu uruchomić sekcję „Gap Analysis Checklist”.

---

## 1. Założenia migracji

### 1.1 Priorytety
1. **Functional parity 1:1** (bez utraty logiki biznesowej).
2. **UI/UX parity** (ta sama semantyka interakcji i informacji).
3. **Stabilność i wydajność** (duże listy punktów, płynna mapa).
4. **Testowalność** (deterministyczne testy algorytmów i integracji).

### 1.2 Zakres MVP parytetu
- 3 workspaces / zakładki,
- import CSV/TXT,
- benchmark wszystkich aktywnych algorytmów,
- scenariusze + tuner parametrów,
- 12 kart map wynikowych,
- ocena manualna,
- export CSV,
- integracje Nominatim + OSRM,
- fallbacki (OSRM->Haversine, brak geometrii).

---

## 2. Docelowa architektura Flutter

### 2.1 Struktura katalogów (proponowana)
```text
lib/
  app/
    app.dart
    router.dart
    theme/
      app_theme.dart
      design_tokens.dart
  core/
    error/
    network/
      http_client.dart
      retry_policy.dart
    utils/
      debounce.dart
      csv_utils.dart
  features/
    benchmark/
      domain/
        entities/
          stop.dart
          coordinate.dart
          route_result.dart
          route_stats.dart
        value_objects/
          solver_config.dart
          scenario_config.dart
        services/
          solver_engine.dart
          scenario_cost.dart
      data/
        datasources/
          osrm_datasource.dart
          nominatim_datasource.dart
        repositories/
          route_repository_impl.dart
      presentation/
        controllers/
          workspace_controller.dart
        widgets/
          workspace_shell.dart
          tuner_panel.dart
          address_input_field.dart
          result_map_card.dart
          tabs_header.dart
```

### 2.2 Stan i zarządzanie logiką
Rekomendacja: **Riverpod + StateNotifier** (lub Bloc, jeśli zespół preferuje event-driven).

- `WorkspaceController` per workspace (3 instancje), zawiera:
  - `startPoint`, `endPoint`, `stops`,
  - `solverConfig`, `scenarioConfig`,
  - `results`, `previousResults`, `ratings`,
  - `status`, `isProcessing`,
  - `isDirty` (czy konfiguracja/inputs zmieniły się od ostatniego benchmarku),
  - `activeRunId` + obiekt anulowania (`CancellationToken`).

- Globalnie:
  - aktywna zakładka,
  - visited tabs (lazy init workspace).

### 2.3 Kontrakty i czysta domena
Algorytmy i kalkulacje umieścić w czystej warstwie Dart (bez zależności UI), dzięki czemu:
- testy jednostkowe są szybkie,
- łatwo porównywać wyniki z React (snapshot golden outputs).

### 2.4 Obliczenia w tle (Background Threading)
Wszystkie algorytmy solvera (`solver_engine.dart`) uruchamiać poza głównym isolate UI:
- preferowane `Isolate.run()` (lub `compute()` dla prostszych przypadków),
- wejście/wyjście przekazywać jako serializowalne DTO (`stops`, configi, scenariusze, seed, wynik),
- utrzymywać płynność UI (loader, animacje, interakcje dotykowe) podczas długich obliczeń.

**Cel jakościowy:** brak dropów responsywności podczas benchmarku, UI pozostaje używalne (progress, cancel, przełączanie sekcji statusu).

---

## 3. Mapping komponentów React -> Flutter

| React | Flutter 1:1 | Uwagi implementacyjne |
|---|---|---|
| `App.tsx` | `TabsHeader + IndexedStack` | `IndexedStack` zachowuje stan kart jak `visitedTabs`. |
| `RouteWorkspace.tsx` | `WorkspaceShell` | Jeden ekran/feature orchestrujący workflow. |
| `AddressInput.tsx` | `AddressInputField` | Debounce + overlay sugestii (`RawAutocomplete`/custom). |
| `TunerPanel.tsx` | `TunerPanel` | Sekcje z `Switch`, `Slider`, checkboxami scenariuszy. |
| `MapPanel.tsx` | `ResultMapCard` + `flutter_map` | Polyline + marker virtualization dla dużych danych. |

---

## 4. Design system (UI/UX parity)

### 4.1 Tokeny kolorów
- Tło app: `#0B0F19`
- Surface: `#111827` / `#1F2937`
- Borders: odcienie `gray-700/800`
- Primary accent: blue (`#3B82F6`)
- Success: emerald (`#10B981`)
- Danger: red (`#EF4444`)

Zdefiniować w `design_tokens.dart` i używać konsekwentnie przez ThemeExtension.

### 4.2 Typografia
- Font główny: sans (np. Inter / system fallback).
- Hierarchia:
  - H1: 32-40, semibold/bold,
  - Karta title: 18,
  - Stat label: 12,
  - Monospace dla metryk (`distance`, `ms`, `eta`).

### 4.3 Spacing i promienie
- Karty: radius 24-32 (odpowiednik `rounded-[2rem]`),
- Główne sekcje: padding 16/24/32,
- Grid wyników: responsywnie 1/2/3 kolumny.

### 4.4 Ruch i mikrointerakcje
- Tab transitions: 200–300ms,
- status loading: subtelne pulse/spin,
- hover desktop można mapować do Material states (ink/overlay),
- mobile: brak „jank” podczas drag mapy.

### 4.5 Stan `isDirty` (UX sygnał aktualności)
- Gdy użytkownik zmieni wejścia lub konfigurację po ostatnim benchmarku, ustaw `isDirty = true`.
- UI powinno czytelnie to sygnalizować (np. pulsujący / wyróżniony przycisk „Run Benchmark”).
- Po udanym benchmarku: `isDirty = false`.
- Opcjonalnie: ostrzeżenie przy wyjściu z ekranu/apki, jeśli są niezapisane oceny.

---

## 5. Integracje HTTP

### 5.1 Nominatim service
- endpoint: `/search?format=json&q=...&addressdetails=1&limit=5`,
- debounce: 500ms,
- bias: `viewbox` oparty o start point lub geolokalizację,
- deduplikacja po `place_id`.

### 5.2 OSRM service
1. `table/v1/driving/...` — matrix km,
2. `route/v1/driving/...` — geometry + road distance.

### 5.3 Odporność
- timeout + retry z backoff,
- soft-fail (app działa dalej na Haversine),
- jawne statusy UI (`Fetching Matrix...`, `Running Algorithms...`, `Fetching Geometry i/n`).

### 5.4 Anulowanie requestów HTTP
- klient HTTP: `dio`,
- każde uruchomienie benchmarku ma własny `CancelToken`,
- anulowanie benchmarku przerywa aktywne requesty OSRM i nie dopuszcza do nadpisania stanu przez „stare” odpowiedzi.

---

## 6. Algorytmy i zgodność obliczeń

### 6.1 Portowanie solverów
Przenieść funkcje 1:1 do `solver_engine.dart`:
- nearest neighbor,
- 2-opt,
- 3-opt,
- simulated annealing,
- farthest insertion,
- cluster anchor farthest,
- farthest street repair,
- farthest directional flow,
- cheapest insertion,
- clarke-wright,
- hilbert,
- convex hull,
- helpery dystansu i ETA.

### 6.2 Tolerancja zgodności
Ze względu na różnice precyzji float:
- dystans: tolerancja ±0.5%,
- duration/ETA: ±1 min,
- kolejność punktów: dopuszczalna różnica tylko jeśli koszt końcowy równoważny i heurystyka niedeterministyczna.

### 6.3 Determinizm
Dla heurystyk losowych (np. SA/GA):
- wprowadzić seedowany RNG,
- seed zapisywać w stanie benchmarku (opcjonalnie do CSV debug).

---

## 7. Benchmark workflow we Flutterze (spec kroków)
1. Snapshot `previousResults`.
2. Utworzenie `runId` + `CancellationToken` dla bieżącego uruchomienia.
3. Deduplikacja stopów po id.
4. Fetch OSRM matrix (anulowalny request).
5. Budowa `baseCostFn` i `scenarioCostFn`.
6. Iteracja po liście algorytmów (w isolate), pomiar czasu (`Stopwatch`) i sprawdzanie `isCancelled`.
7. Zapis wyników bazowych.
8. Dla każdej unikalnej sygnatury trasy fetch geometrii (z cache, requesty anulowalne).
9. Aktualizacja kart i statusu.
10. Odblokowanie UI.

### 7.1 Obsługa anulowania (Cancellation)
Każdy benchmark musi wspierać przerwanie pracy:
- kliknięcie „Stop” ustawia `isCancelled = true`,
- pętle algorytmów i etapy pipeline sprawdzają flagę anulowania,
- requesty HTTP (OSRM) anulowane przez `Dio CancelToken`,
- po anulowaniu: status `Idle`, odtworzenie `previousResults` (jeśli istnieją), zachowanie spójnego stanu kontrolera.

---

## 8. Map rendering (Flutter)

### 8.1 Pakiet
Rekomendacja: `flutter_map` + `latlong2` (łatwa kontrola warstw i markerów).

### 8.2 Wydajność
- marker culling dla tras >200,
- batch aktualizacji markerów,
- osobny widget dla polyline i marker layer,
- unikać pełnego rebuild całej karty na każdą zmianę statusu.

### 8.3 Styl mapy
- dark tiles (Carto dark / alternatywa z licencją zgodną),
- grubość linii 3, dashed gdy brak road geometry.

### 8.4 Strategia renderowania markerów (precyzyjna)
Dla tras >200 punktów nie stosować wyłącznie prostego cullingu:
- preferowane podejście: `marker_cluster` (agregacja) **lub** viewport indexing oparty o QuadTree,
- utrzymywać różnicowe aktualizacje markerów (dodawanie/usuwanie tylko zmienionych punktów),
- stosować stabilne `Key` oparte o `stop.id`, aby ograniczyć przebudowę całej warstwy markerów,
- zachować semantykę React: agresywnie optymalizować tylko duże zbiory, dla małych tras preferować płynny UX bez „pop-in”.

---

## 9. Platform Adaptability & Permissions

### 9.1 Geolokalizacja (Android/iOS/Web)
- pakiet rekomendowany: `geolocator`,
- obsługa pełnego flow uprawnień: granted / denied / deniedForever,
- fallback przy odmowie: ręczne wpisywanie adresu lub domyślne centrum mapy.

### 9.2 Import/eksport plików per platforma
- **Web:** upload przez input pliku, eksport przez mechanizm web download,
- **Mobile:** import przez `file_picker`, eksport preferencyjnie przez `share_plus` (udostępnij plik),
- uwzględnić Android 11+ (Scoped Storage): unikać założenia bezpośredniego zapisu do `Downloads` bez dodatkowych integracji.

### 9.3 UX decyzja platformowa
Na mobile preferować „Udostępnij plik” zamiast klasycznego „Pobierz plik”, bo jest to prostsze i bardziej niezawodne dla użytkownika.

---

## 10. Import/Export

### 10.1 Import CSV/TXT
- wykrywanie separatora `,` lub `;`,
- elastyczne mapowanie nazw kolumn (`lat/lng`, `address/adres`, `city/miasto`),
- walidacja i raport błędnych wierszy.

### 10.2 Export CSV
- BOM UTF-8,
- separator `;`,
- te same kolumny i wzór auto-score,
- nazwa pliku timestampowana.

---

## 11. Plan wdrożenia etapami

### Etap 0 — baseline
- uruchomienie szkieletu Flutter + theme + routing + stan globalny.

### Etap 1 — domena i dane
- modele, configi, parser CSV, integracje Nominatim/OSRM.

### Etap 2 — solver engine
- port algorytmów + testy jednostkowe zgodności.

### Etap 3 — UI core
- tabs, workspace, tuner, address input.

### Etap 4 — map cards
- grid kart, mapy, metryki, delty, oceny manualne.

### Etap 5 — export i regresja
- CSV export + testy E2E workflow.

### Etap 6 — polish UI/UX
- animacje, responsywność, edge cases, performance tuning.

---

## 12. Strategia testowa

### 12.1 Unit tests
- parser CSV,
- cost functions/scenario multipliers,
- każda heurystyka na małych fixture datasets.

### 12.1.1 Snapshot testing solvera (JSON)
Niezależnie od UI, utrzymywać zestawy danych:
- `golden_input.json` (wejście testowe),
- `golden_output.json` (oczekiwane wyniki per algorytm).

Testy solvera porównują wynik Dart z JSON (path + distance + tolerancja):

```dart
test('2-opt parity', () {
  final result = SolverEngine.solve2opt(testStops);
  expect(result.path, equals(goldenOutput['2-opt']['path']));
  expect(result.distance, closeTo(goldenOutput['2-opt']['distance'], 0.01));
});
```

### 12.2 Golden tests
- karty map/stats (bez rzeczywistego tile network),
- warianty light/dark jeśli planowane.

### 12.3 Integration tests
- pełny flow: import -> benchmark -> ratings -> export.

### 12.4 Benchmark parity harness
- ten sam input dataset w React i Flutter,
- porównanie wyników do raportu JSON/CSV.

---

## 13. Gap Analysis Checklist (gdy repo Flutter jest dostępne)
1. Czy struktura ekranów odpowiada 1:1? (tabs, workspace, grid)
2. Czy wszystkie algorytmy z React są obecne i uruchamiane?
3. Czy scenariusze wpływają na ETA/duration tak samo?
4. Czy import i export są kompatybilne formatowo?
5. Czy mapa obsługuje duże zbiory bez zacięć?
6. Czy fallbacki sieciowe działają identycznie?
7. Czy statusy i błędy są czytelne i nie blokują UX?
8. Czy benchmark działa w isolate i UI pozostaje responsywne?
9. Czy anulowanie benchmarku przerywa pętle i requesty OSRM?
10. Czy `isDirty` poprawnie sygnalizuje nieaktualne wyniki?

---

## 14. Definition of Done (perfekcyjne przeniesienie)
- 100% krytycznych workflow przechodzi testy,
- różnice metryk mieszczą się w tolerancjach,
- brak crashy i brak dead-end UX,
- kod podzielony na warstwy i gotowy do dalszego rozwoju mobile,
- dokumentacja deweloperska + checklista release,
- obliczenia solvera wykonywane poza main isolate,
- pełna obsługa anulowania benchmarku i anulowania requestów HTTP.

---

## 15. Kluczowe decyzje implementacyjne (anti-gotchas)
1. **Isolates od początku projektu** — nie odkładać na etap optymalizacji końcowej.
2. **Cancellation-by-design** — każdy etap pipeline i każde żądanie OSRM musi mieć ścieżkę anulowania.
3. **Platform-first I/O** — mobile przez share flow, web przez download flow.
4. **Solver parity przez JSON snapshots** — decyzje o zgodności oparte o dane, nie ocenę wizualną.
5. **`isDirty` jako sygnał UX** — użytkownik zawsze widzi, czy wynik jest aktualny względem konfiguracji.
