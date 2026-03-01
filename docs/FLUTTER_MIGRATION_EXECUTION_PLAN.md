# RouteBench Flutter Migration — Execution Plan (Ticket-Ready)

Ten dokument zamienia blueprint na plan realizacyjny „od jutra”, z atomowymi zadaniami, kolejnością wdrożenia i kryteriami odbioru.

---

## 1) Cel wykonawczy
Dowieźć aplikację Flutter z parytetem 1:1 wobec React (funkcje, UX, eksport/import, scenariusze, benchmark), bez zamrażania UI podczas obliczeń i z pełną strategią anulowania benchmarku.

---

## 2) Zasady realizacji (nienegocjowalne)
1. **Solver działa poza main isolate**.
2. **Każdy benchmark ma CancellationToken + runId**.
3. **Paritet liczony danymi (JSON snapshots), nie „na oko”**.
4. **Mobile I/O = share-first (nie download-first)**.
5. **Stan `isDirty` sygnalizuje nieaktualne wyniki**.

---

## 3) Plan sprintowy

## Sprint 0 — Foundation (2–3 dni)
### Zadania
- [ ] Utworzyć szkielet projektu Flutter i moduły (`app/core/features`).
- [ ] Dodać `design_tokens.dart` + `app_theme.dart` (dark-first).
- [ ] Dodać podstawowy routing i shell zakładek (`IndexedStack`).
- [ ] Dodać modele domenowe (`Stop`, `RouteResult`, `RouteStats`, `SolverConfig`, `ScenarioConfig`).

### Definition of Done
- [ ] App się uruchamia na Android/iOS/Web.
- [ ] 3 zakładki istnieją i zachowują stan po przełączeniu.

---

## Sprint 1 — Data & Integrations (3–4 dni)
### Zadania
- [ ] Implementacja `nominatim_datasource.dart` z debounce + bias + deduplikacją.
- [ ] Implementacja `osrm_datasource.dart` (table + route).
- [ ] Dodanie retry/timeout policy + cancel support (Dio `CancelToken`).
- [ ] Implementacja `csv_import_export_service.dart` (CSV/TXT import + BOM/`;` export).
- [ ] Platform adapt: web upload/download, mobile file_picker + share_plus.

### Definition of Done
- [ ] Import i export działają na web + mobile.
- [ ] Błędy sieciowe nie crashują flow (fallback działa).

---

## Sprint 2 — Solver Core + Isolates (4–6 dni)
### Zadania
- [ ] Port helperów dystansu/czasu/scenario multipliers.
- [ ] Port wszystkich algorytmów z aktywnej listy benchmarku.
- [ ] Uruchamianie solvera przez `Isolate.run`.
- [ ] Implementacja mechanizmu `runId` + `CancellationToken`.
- [ ] Obsługa `Stop` benchmarku: cancel pętli + cancel HTTP + rollback do `previousResults`.

### Definition of Done
- [ ] UI pozostaje responsywne podczas benchmarku.
- [ ] Anulowanie działa deterministycznie i nie zostawia niespójnego stanu.

---

## Sprint 3 — UI Feature Parity (4–5 dni)
### Zadania
- [ ] `WorkspaceShell` z pełnym stanem i statusami.
- [ ] `AddressInputField` (overlay sugestii).
- [ ] `TunerPanel` (slidery, toggles, scenariusze).
- [ ] `ResultMapCard` (statystyki, delta, rating).
- [ ] Grid wyników 1/2/3 kolumny + dark map style.
- [ ] Flaga `isDirty` + wyróżnienie przycisku Run.

### Definition of Done
- [ ] Komplet workflow: start/end -> run -> compare -> rate -> export.
- [ ] UX parity na mobile i desktop.

---

## Sprint 4 — Testy parity + Stabilizacja (3–4 dni)
### Zadania
- [ ] Unit tests solvera i parsera CSV.
- [ ] JSON snapshot suite (`golden_input.json`, `golden_output.json`).
- [ ] Integration tests flow end-to-end.
- [ ] Profiling map marker layer (>200 punktów).
- [ ] Fixy wydajności i edge-case’ów.

### Definition of Done
- [ ] Różnice metryk mieszczą się w tolerancjach.
- [ ] Brak crashy w krytycznych flow.

---

## 4) Backlog atomowy (ticket list)

## EPIC A — Workspace State
- [ ] A1: `WorkspaceState` + `copyWith` + serializacja.
- [ ] A2: `isDirty` rules (set/reset).
- [ ] A3: `previousResults` snapshot logic.

## EPIC B — Cancellation
- [ ] B1: `CancellationToken` model.
- [ ] B2: run lifecycle (`runId` guard against stale updates).
- [ ] B3: UI `Stop` button + rollback behavior.

## EPIC C — Solver Isolation
- [ ] C1: isolate request/response DTO.
- [ ] C2: isolate worker bootstrap.
- [ ] C3: cancellation checkpoints in long loops.

## EPIC D — Map Performance
- [ ] D1: marker layer with stable `Key(stop.id)`.
- [ ] D2: >200 strategy (`marker_cluster` or QuadTree).
- [ ] D3: benchmark FPS/profiling report.

## EPIC E — Platform I/O
- [ ] E1: geolocator permissions matrix.
- [ ] E2: mobile share export path.
- [ ] E3: web export path.

## EPIC F — Parity Testing
- [ ] F1: fixtures + golden json.
- [ ] F2: per-algorithm parity tests.
- [ ] F3: CI gate on parity thresholds.

---

## 5) Kryteria akceptacji parity
1. Lista algorytmów i kolejność benchmarku identyczna.
2. Format import/export kompatybilny.
3. ETA/duration zgodne z tolerancją:
   - dystans ±0.5%,
   - ETA ±1 min.
4. Brak freeze UI podczas benchmarku.
5. Cancel benchmarku działa poprawnie.
6. `isDirty` poprawnie sygnalizuje stale results.

---

## 6) Ryzyka i mitigacje
- **Ryzyko:** brak repo Flutter do porównania bazowego.
  - **Mitigacja:** parity harness oparty o fixtures React.
- **Ryzyko:** publiczne OSRM/Nominatim niestabilne.
  - **Mitigacja:** retry + fallback + testy na fixture offline.
- **Ryzyko:** przebudowa markerów powoduje jank.
  - **Mitigacja:** keyed diff + clustering/QuadTree + profiling.

---

## 7) Checklist „Go Live”
- [ ] Wszystkie epiki zamknięte.
- [ ] Testy parity zielone.
- [ ] Testy integracyjne zielone.
- [ ] Manual smoke na Android/iOS/Web.
- [ ] Release notes + known limitations.
