# PharmAlert AI

A medication safety workspace with a React/Vite web frontend, a native Expo app, and a shared Supabase backend for hosted accounts and records. Both frontends share the same typed data services and evidence model. The backend runs the interaction engine against a bundled, version-pinned reference set.

| Folder | Purpose |
| --- | --- |
| [apps/web-frontend](apps/web-frontend) | Browser app built with React DOM, Vite, Tailwind CSS, Lucide and Recharts |
| [apps/app-frontend](apps/app-frontend) | Native Android and iOS app built with Expo Router and React Native |
| [backend](backend) | First-party HTTP server, account sessions, scoped data, prescription files |
| [packages/interaction-engine](packages/interaction-engine) | Identity resolution, unique pair matching and evidence reports |
| [packages/shared](packages/shared) | Shared record descriptions and application text |
| [packages/data-services](packages/data-services) | Shared HTTP client and report generation |
| [datasets](datasets) | Curated interaction records, source verification and provenance |
| [ml-research](ml-research) | Research status and conditions for future model evaluation |
| [tests](tests) | Unit, backend, Selenium, Appium and k6 checks |

## Run locally

Use Node.js 24 or later. No third-party API keys are required. The browser and native app each sign in with a normal account and use a revocable account session.

```sh
npm ci
npm start
```

Use `npm run server` and `npm run dev` in separate terminals if you want to start the services independently.

Open http://127.0.0.1:5173. Create an account, open the checker, and enter **Zocor** and **gemfibrozil** as medicines to see the pinned source record and its revision. Use an empty local database for test data. Set `PHARMALERT_DB=:memory:` before starting the server if you want an ephemeral test database.

Use `npm run mobile` in a third terminal to start Expo. For local testing set `EXPO_PUBLIC_BACKEND_URL` to `http://10.0.2.2:8787`. For an iOS simulator use `http://127.0.0.1:8787`. For a physical device set `EXPO_PUBLIC_BACKEND_URL` in `apps/app-frontend/.env.local` to an address reachable from the phone, and run the server on an appropriate private development interface. Use HTTPS in deployed builds.

## Build and verify

```sh
npm run check
npm test
npm run test:backend
npm run build
npm exec -w @pharmalert/app-frontend -- expo export --platform android
npm run verify:dataset
```

The dataset verification command fetches the pinned label revision from openFDA without a key. Runtime interaction checks work entirely from local evidence. See [dataset provenance](datasets/dataset-provenance.md) for the pinned identifier, coverage, mapping, and license.

With the test backend and web server running, use `npm run test:web` for Selenium. Chrome and a matching ChromeDriver are required. Selenium Manager can discover the driver. For Appium, set `PHARMALERT_APK` to an installed-build APK, start Appium with UiAutomator2 and an Android emulator, and run `npm run test:mobile`. Set `APPIUM_URL` if needed. The GitHub Actions quality gate runs baseline/security, Selenium, Appium, and k6 in separate parallel jobs, then combines their evidence in a final summary.

The UI suites include 360 parameterized pair cases across eight ten-substance reports. Selenium submits each report in Chrome. Appium signs up in the Android app, creates a medicine, submits a check, then opens and scrolls saved reports created through the local backend. Set PHARMALERT_API_URL if the host-side backend is outside http://127.0.0.1:8787/api. Each runner records the displayed result against an independent expected value for each pair in reports/evidence. The fixtures cover all four release rules, recognized pairs without a rule, and unrecognized substances. They also exercise case, spelling, alias and input-order variations. The APK is an emulator test build configured for the local HTTP backend. Running a production build on a device requires an HTTPS backend URL.

## Release scope

The medicine and supplement pickers use local US name catalogs from Drugs@FDA and NIH DSLD. See [catalog sources and refresh instructions](datasets/catalog/README.md). Search includes historical names. Catalog inclusion alone establishes neither current availability nor interaction evidence.

The release audit records 47 source-verified interaction rules and two unverified entries. Only verified rules produce confirmed matches. Clinical review is outstanding. The [offline ML research tool](ml-research/README.md) is separate from patient-facing findings.

Web and mobile default to the PharmAlert Supabase Edge Function over HTTPS. Supabase Auth identifies the user, and database row-level security scopes stored records. Email confirmation is disabled for new registrations. Local SQLite and the local HTTP server are used for development and CI. Legacy local records require verified ownership before migration. For the local web server and Vite proxy together, use `npm start`.
