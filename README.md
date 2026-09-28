# SaparSplit — вход через Google

Этот бэкенд добавляет к SaparSplit полноценные аккаунты: вход через Google,
данные хранятся в SQLite на сервере и доступны с любого устройства, где
человек вошёл под тем же Google-аккаунтом.

## Что внутри

```
saparsplit-backend/
├── public/index.html   ← фронтенд (уже с кнопкой Google-входа)
├── server.js            ← Express-сервер, API, статика
├── db.js                 ← схема SQLite (создаётся автоматически)
├── db/                    ← файл базы данных появится здесь
├── package.json
└── .env.example
```

## База данных

Проект использует встроенный в Node.js модуль `node:sqlite` — отдельно
ставить SQLite или компилятор C++ не нужно. Требуется Node.js версии
**22.5 и выше**. При старте сервера в консоли может появиться строка вида
`ExperimentalWarning: SQLite is an experimental feature...` — это не
ошибка, просто предупреждение, работе не мешает.

## Шаг 1. Получить Google Client ID

1. Откройте https://console.cloud.google.com/ и создайте новый проект (или
   выберите существующий).
2. Слева: **APIs & Services → OAuth consent screen**. Выберите тип
   "External", заполните название приложения, email — сохраните.
3. Слева: **APIs & Services → Credentials → Create Credentials → OAuth
   client ID**.
4. Тип приложения — **Web application**.
5. В поле **Authorized JavaScript origins** добавьте адрес, с которого
   будет открываться сайт, например:
   - `http://localhost:3000` — для локального теста
   - `https://ваш-домен.kz` — для продакшена
6. Поле "Authorized redirect URIs" можно оставить пустым — используется
   способ входа без редиректов (Google Identity Services popup/one-tap).
7. Нажмите Create — появится **Client ID** вида
   `123456-abc.apps.googleusercontent.com`. Скопируйте его.

## Шаг 2. Настроить проект

```bash
cd saparsplit-backend
npm install
cp .env.example .env
```

Откройте `.env` и впишите:

```
GOOGLE_CLIENT_ID=скопированный_client_id.apps.googleusercontent.com
JWT_SECRET=любая-длинная-случайная-строка
PORT=3000
```

Затем откройте `public/index.html`, найдите в начале `<script>` строку:

```js
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
```

и впишите туда **тот же самый** Client ID (он используется и на
фронтенде, и на бэкенде — это нормально, Client ID не секретный).

## Шаг 3. Запустить

```bash
npm start
```

Откройте `http://localhost:3000` — должен появиться экран входа с кнопкой
"Sign in with Google".

## Как это работает

1. Пользователь нажимает кнопку входа → Google возвращает подписанный
   ID-токен прямо в браузер.
2. Браузер отправляет этот токен на `POST /api/auth/google`.
3. Сервер проверяет токен через `google-auth-library` (убеждается, что он
   действительно от Google и для вашего Client ID), находит или создаёт
   пользователя в таблице `users`, выдаёт свой собственный токен сессии
   (JWT, 30 дней).
4. Этот токен браузер хранит в `localStorage` и добавляет ко всем
   запросам как `Authorization: Bearer <token>`.
5. Все поездки и расходы в базе привязаны к `user_id` — один пользователь
   не видит чужие данные.

## Продакшен

- Обязательно используйте HTTPS (Google Identity Services требует
  безопасный origin, кроме `localhost`).
- Задеплоить можно на любой сервис с поддержкой Node.js (Render, Railway,
  VPS + PM2/nginx и т.п.) — SQLite-файл достаточно держать на постоянном
  диске.
- Не забудьте добавить боевой домен в **Authorized JavaScript origins** в
  Google Cloud Console.
