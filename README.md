# Le mie serie: guida per metterla online

Un'app installabile sul telefono (PWA) per tenere traccia delle serie TV e dell'episodio a cui sei arrivato.

- **Accesso** con un link via email, senza password
- **Sincronizzazione** tra telefono e computer, con i dati salvati su Supabase
- **Ricerca delle serie** su TMDB: stagioni, episodi, locandine, genere e piattaforma in Italia
- **Funziona offline**: senza rete vedi l'ultima versione salvata

Ti servono tre account gratuiti: **Supabase** (database e login), **TMDB** (dati delle serie) e **Vercel** (hosting), più **GitHub** per caricare i file. Tempo stimato: 30–45 minuti la prima volta.

---

## Cosa c'è nella cartella

| File | A cosa serve |
|---|---|
| `index.html`, `style.css`, `app.js` | L'app vera e propria |
| `config.js` | **Da compilare:** i dati del tuo progetto Supabase |
| `api/tmdb.js` | Il ponte verso TMDB. Gira su Vercel e tiene segreta la chiave |
| `supabase/schema.sql` | Crea la tabella delle serie nel database |
| `manifest.webmanifest`, `sw.js`, `icons/` | Rendono l'app installabile e utilizzabile offline |
| `vercel.json` | Piccole impostazioni per Vercel |
| `import-dati.json` | Le serie che avevi nel tracker su Claude, pronte da importare |

---

## 1. Supabase: database e login

1. Vai su **supabase.com**, crea un account e poi un nuovo progetto. Per la regione scegli quella europea più vicina (es. Frankfurt) e annota la password del database.
2. Quando il progetto è pronto apri **SQL Editor → New query**. Incolla tutto il contenuto di `supabase/schema.sql` e premi **Run**. Deve comparire "Success".
3. Apri **Project Settings → API**, oppure il pulsante **Connect** in alto, e copia due valori:
   - **Project URL**, del tipo `https://abcd1234.supabase.co`
   - la chiave pubblica: **anon public** oppure **publishable key**, a seconda di come la chiama Supabase. *Non* la chiave `service_role` o `secret`.
4. Apri `config.js` e incolla i due valori al posto di `INCOLLA-QUI…`.

> La chiave pubblica può stare nel codice: ognuno vede solo le proprie serie grazie alle regole di sicurezza create al punto 2.

## 2. TMDB: dati delle serie

1. Crea un account su **themoviedb.org**.
2. Vai su **Impostazioni → API** e richiedi una chiave per uso personale. Ti chiedono una breve descrizione: puoi scrivere "app personale per tenere traccia delle serie TV che guardo".
3. Copia l'**API Read Access Token**, quello lungo che inizia con `eyJ…`. Ti servirà al punto 4.

## 3. GitHub: carica i file

1. Su **github.com** crea un nuovo repository, per esempio `le-mie-serie`. Va bene anche privato.
2. Premi **uploading an existing file** e trascina **tutto il contenuto** della cartella, con le sottocartelle `api`, `icons` e `supabase`. Poi conferma con **Commit changes**.

## 4. Vercel: pubblica l'app

1. Su **vercel.com** accedi con il tuo account GitHub.
2. Premi **Add New → Project** e importa il repository `le-mie-serie`.
3. Prima di premere Deploy apri **Environment Variables** e aggiungi:
   - Name: `TMDB_TOKEN`
   - Value: il token TMDB del punto 2
4. Premi **Deploy**. Dopo un minuto avrai un indirizzo del tipo `https://le-mie-serie.vercel.app`.

## 5. Collega il login all'indirizzo dell'app

In Supabase apri **Authentication → URL Configuration**:

- **Site URL**: l'indirizzo Vercel, es. `https://le-mie-serie.vercel.app`
- **Redirect URLs**: aggiungi lo stesso indirizzo

Senza questo passaggio il link nell'email ti riporterebbe alla pagina sbagliata.

## 6. Installala sul telefono

- **iPhone**: apri l'indirizzo con **Safari** → pulsante **Condividi** → **Aggiungi alla schermata Home**.
- **Android**: apri l'indirizzo con **Chrome** → menu ⋮ → **Installa app** (o "Aggiungi a schermata Home").

Accedi con la tua email e apri il link che ricevi.

> **Su iPhone:** il link dell'email si apre in Safari, non nell'app installata. La prima volta conviene fare l'accesso da Safari e *poi* aggiungere l'app alla Home. Se l'app installata ti chiede di nuovo l'accesso, rifallo da lì.

## 7. Importa le serie che avevi

Nell'app tocca **Importa dati** in fondo alla pagina, incolla il contenuto di `import-dati.json` e premi **Importa**. Severance, The Bear e Stranger Things compaiono con i tuoi progressi. Per avere anche le locandine, apri ognuna con ✎ e premi **Aggiorna info**.

---

## Modifiche future

- Ogni volta che cambi un file su GitHub, Vercel ripubblica l'app da solo.
- Quando modifichi `app.js`, `style.css` o `index.html`, aumenta la versione in `sw.js` (`serie-v1` → `serie-v2`). Così i telefoni scaricano subito la versione nuova.
- Il pulsante **Copia i miei dati**, nella finestra "Importa dati", ti dà un backup in qualsiasi momento.

## Se qualcosa non va

| Problema | Soluzione |
|---|---|
| "Manca la configurazione" | `config.js` non è compilato, oppure non hai caricato la versione aggiornata su GitHub |
| La ricerca dice "TMDB_TOKEN mancante" | Aggiungi la variabile su Vercel (Settings → Environment Variables) e poi fai **Redeploy** |
| Il link dell'email porta a "localhost" o a una pagina d'errore | Controlla il passaggio 5 |
| L'email non arriva | Guarda nello spam. Il servizio email gratuito di Supabase manda pochi messaggi all'ora: aspetta qualche minuto e riprova |

## Idee per dopo

- **Notifiche** quando esce un nuovo episodio: con una funzione pianificata su Supabase che controlla TMDB ogni giorno
- **Titoli degli episodi** nel pulsante "Prossimo" (TMDB li fornisce stagione per stagione)
- **App negli store** con React Native / Expo, riusando la stessa tabella Supabase e la stessa funzione TMDB
