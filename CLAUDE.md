# Fabrista — Цифровое меню-киоск

Интерактивное меню для кофейни "Fabrista" с интеграцией iiko POS.
Полностью data-driven: всё конфигурируется через `menu.json`, который генерирует iiko.

---

## Файловая структура

```
fab_menu/
├── CLAUDE.md           # Этот файл — контекст проекта (читай при старте)
├── index.html          # HTML-каркас (минимальный)
├── style.css           # Вся стилизация (адаптив, модалки, корзина)
├── script.js           # Вся логика рендера, корзины, модалок
├── menu.json           # ДАННЫЕ (iiko) — только имена, цены
├── content.json        # КОНТЕНТ — описания, бейджи (редакционный контент)
└── images/
    ├── logo.svg                                # Логотип (хостится локально)
    ├── Espresso.jpg
    ├── Americano.jpg
    ├── фильтр кофе.jpg
    ├── Cappuccino.jpg
    ├── Latte.jpg
    ├── Flat White.jpg
    ├── Раф.jpg
    ├── какао.jpg
    ├── tea.jpg
    ├── малина-имбирь.jpg
    ├── Безалкогольный глинтвейн на вишневом соке — рецепт с фото.jpg
    ├── Облепиховый чай – Рецепт пошагово с фото.jpg
    ├── ice-coffe.jpg
    ├── The Perfect Espresso Tonic Twist.jpg
    ├── Spiced Vanilla Cold Brew Concentrate.jpg
    ├── Эстетика_ Летний бамбл кофе.jpg
    ├── гранат-кумкват.jpg
    ├── Щавелевый лимонад _ Sorrel lemonade.jpg
    ├── fresh.jpg
    ├── Smooth, creamy, and effortlessly classic 🤍_...название....jpg   # Коктейль
    ├── frantsuzskiy-zavtrak.jpg
    ├── syrniki-so-smetanoy.jpg
    ├── skrembl-s-lososem.jpg
    ├── granola-s-yogurtom.jpg
    ├── kasha-risovo-kokosovaya.jpg
    ├── sendvich-s-kuritsey.jpg
    ├── kruassan-s-lososem.jpg
    ├── brusketta-s-tomatami.jpg
    ├── tost-s-avokado.jpg
    ├── salat-s-grushey-i-gorgonzoloy.jpg
    ├── tsezar-s-kuritsey.jpg
    ├── tykvennyy-sup-krem.jpg
    └── tomatnyy-sup-s-bazilikom.jpg
```

---

## Архитектура

### Принципы
1. **Два JSON-файла** — iiko генерирует `menu.json` (только данные), редакционный контент + конфигурация аддонов в `content.json`.
2. **Изображения — маппинг в JS, не в JSON** — iiko не передаёт фото. Маппинг `itemImages` в `script.js`.
3. **Никаких хардкодов** — аддоны, табы, категории — всё динамически из JSON.
4. **Мерж в JS** — `script.js` загружает оба файла, сливает описания и аддоны из `content.json` в данные.

### Структура menu.json (только iiko-данные)
```jsonc
{
  "tabs": [ /* { id, title, icon (SVG) } */ ],

  // Секции только те, чьи id совпадают с tab id
  "bar": [
    {
      "title": "Название категории",
      "items": [
        {
          "name": "Название",
          "sizes": ["S — 230₽", "M — 290₽"],   // цена в каждом размере
          "addons": ["syrup", "milk"]            // ключи из addons
        }
      ]
    }
  ],
  "kitchen": [ /* без sizes, но с priceDisplay */ ]
}
```

### Структура content.json (редакционный контент)
```jsonc
{
  "addons": { /* ключ: определение аддона (toggle/choice, цены, опции) */ },
  "badges": { "matcha": { "icon": "🍃", "text": "матча" } },
  "items": {
    "Эспрессо": {
      "desc": "Краткое описание для превью",
      "detailed": "Полное описание (в модалке)",
      "badge": null                           // или "matcha" — ключ из badges
    }
  }
}
```

> **Примечание:** Поле `icons` в аддонах удалено — не использовалось в UI. Иконки эмодзи не рендерятся.

### Детекция секций
Секциями считаются только те ключи `menu.json`, которые совпадают с `id` табов. Это надёжнее, чем `filter(k => k !== 'tabs')` — любое новое мета-поле (например `settings`) не станет секцией меню.

```js
const tabIds = menuData.tabs.map(t => t.id);
for (const tabId of tabIds) {
    if (json[tabId]) menuData[tabId] = json[tabId];
}
```

### Процесс загрузки
1. Fetch `menu.json` + `content.json` (параллельно)
2. Пока грузятся — показывается **skeleton-загрузка** (6 карточек с shimmer-анимацией, 2 колонки)
3. После загрузки: мерж данных, скрытие skeleton, рендер меню со stagger-анимацией
4. При ошибке: skeleton скрывается, показывается сообщение «Не удалось загрузить меню»

---

## Система аддонов

Типы в `content.json → addons`:

| Тип | Описание | Пример |
|-----|----------|--------|
| `toggle` | Вкл/выкл, один чипс | `matcha`, `protein`, `urbech` |
| `choice` | Выбор из опций, группа чипсов | `syrup`, `milk`, `cocktail_flavor`, `raf_flavor`, `cacao_type`, `fresh_flavor` |

Поля choice-аддона:
- `"required": true` — авто-выбор первого варианта, **снять нельзя** (обрабатывается в `renderChoiceSection`)
- `"flatPrice": 0` — фиксированная цена
- `"pricesBySize": {"M": 40, "L": 50}` — цена зависит от размера

### Оптимизация рендера аддонов
- **Toggle-чипсы** — при клике переключается только `choice-chip--active` на конкретной кнопке, без перерисовки DOM
- **Choice-чипсы** — при клике перерисовывается только одна секция (`renderChoiceSection(key)`), а не все аддоны целиком
- **Смена размера** — полный перерендер (цены аддонов зависят от размера через `pricesBySize`)

---

## Дизайн-система

| Токен | Значение |
|-------|----------|
| Фон | `#fff6e5` (тёплый кремовый) |
| Акцент (оранжевый) | `#f16138` / градиент `#d94d2a` |
| Тёмный (винный) | `#3d162f` |
| Шрифт заголовков | `Playfair Display` |
| Шрифт тела | `Inter` |

### Сетка
- Всегда 2 колонки на любом устройстве.
- Брейкпоинты: 640px → gap/thumb size, 480px, 380px.
- `.menu__item` с фото → `grid-template-rows: auto 1fr`.

### Скролл модалки
- `.modal-card`: `max-height: 90vh; display: flex; flex-direction: column;`
- `.modal-body`: `overflow-y: auto; flex: 1; min-height: 0;` + `-webkit-overflow-scrolling: touch`
- Корзина — отдельная модалка с прокруткой + `-webkit-overflow-scrolling: touch`

---

## iOS-фиксы (проверено на iPhone 11)

1. **Sticky hover** — все `:hover` обёрнуты в `@media (hover: hover) {}`.
2. **Tap highlight** — `-webkit-tap-highlight-color: transparent` на всех кнопках.
3. **Active state** — свои `:active` стили (оранжевый градиент на `choice-chip`). Пустой `touchstart` listener на document форсирует `:active` на iOS.
4. **Focus cleanup** — после touchend через setTimeout `document.activeElement?.blur()`.
5. **Global touch-action** — `touch-action: manipulation` на `<html>` (блокировка zoom + двойного тапа).
6. **Passive touch events** — `{passive: true}` на всех touch-обработчиках.
7. **Выделение текста** — глобально `user-select: none`, `-webkit-touch-callout: none`.

---

## Корзина

- Хранится в `cart[]` (массив объектов).
- **Persist в localStorage** — `saveCart()`/`loadCart()`, ключ `fab_menu_cart`. Сохраняется при любом изменении.
- `generateCartId()` — для дедупликации одинаковых позиций.
- FAB-кнопка корзины появляется при `count > 0` (класс `cart-fab--visible`).
- Кнопка "Оформить заказ" очищает корзину, закрывает модалку, скроллит наверх.
- `formatPrice()` — `ru-RU` локаль для пробелов в тысячах.
- Toggle-аддоны показывают цену: `+80₽`. Если `0₽` — цена не показывается.
- Choice-аддоны показывают цену чипса только если `price > 0`.

---

## Особенности рендера

- **Табы** — динамически из `menuData.tabs`. Содержимое переключается классом `menu__content--active`.
- **Таб persist** — активный таб сохраняется в `localStorage` (`fab_menu_active_tab`), восстанавливается при перезагрузке.
- **Анимация** — stagger-анимация через CSS `--i` при переключении табов.
- **Loading skeleton** — 6 карточек с `skeletonShimmer` анимацией, показываются сразу (HTML/CSS), скрываются после загрузки данных через класс `menu__loading--done`.
- **Карточка товара без sizes** — `currentBasePrice` вычисляется через `parseItemBasePrice(item.priceDisplay)`, которая берёт первое число из `priceDisplay`.
- **Fallback картинок** — `onerror` на всех img: карточка меню теряет `--has-image` и показывает оранжевую плашку; модалка скрывает фото; корзина подставляет серый плейсхолдер. `encodeURIComponent` на путях не используется — файлы отдаются как есть.
- **Модалка** — показывается для всех товаров; bar-товары (с `sizes`) получают кастомизацию, kitchen — только количество.
- **Cacao required** — `cacao_type` обязательный choice с 2 опциями (шоколад / порошок), авто-выбирает первый, снять нельзя.
- **Fresh required** — `fresh_flavor` обязательный choice с 5 опциями (апельсин/яблоко/морковь/яблоко-апельсин/яблоко-морковь), снять нельзя.

---

## Kiosk-специфика

- **Idle timer** — 60 секунд без тача/клика сбрасывает корзину, закрывает модалки и возвращает на первый таб. `scroll` не сбрасывает таймер (чтение не прерывает ожидание).
- **Блокировка зума** — `touch-action: manipulation` на `<html>`.
- **Выделение текста** — глобально запрещено (`user-select: none`).
- **Текстовый ввод** — поле "Имя" и "Комментарий" в корзине вызывают экранную клавиатуру. На киоске это неудобство (ожидает бэкенд для полноценного решения).

---

## Изображения — маппинг в JS

Объект `itemImages` в `script.js` (не в JSON! iiko не отправляет фото).
Функция `getItemImage(name)` возвращает имя файла или `''`.

Пути к файлам не кодируются через `encodeURIComponent` — браузер и сервер работают с UTF-8 напрямую.

<details>
<summary>Текущий маппинг</summary>

| Название в JSON | Файл |
|----------------|------|
| Эспрессо | Espresso.jpg |
| Американо | Americano.jpg |
| Фильтр | фильтр кофе.jpg |
| Капучино | Cappuccino.jpg |
| Латте | Latte.jpg |
| Флэт Уайт | Flat White.jpg |
| Раф | Раф.jpg |
| Какао | какао.jpg |
| Чай | tea.jpg |
| Малина Имбирь | малина-имбирь.jpg |
| Глинтвейн Вишнёвый | Безалкогольный глинтвейн на вишневом соке — рецепт с фото.jpg |
| Груша Облепиха | Облепиховый чай – Рецепт пошагово с фото.jpg |
| FAB | ice-coffe.jpg |
| Эспрессо Тоник | The Perfect Espresso Tonic Twist.jpg |
| Колд-брю Кола | Spiced Vanilla Cold Brew Concentrate.jpg |
| Бамбл | Эстетика_ Летний бамбл кофе.jpg |
| Гранат с Кумкватом | гранат-кумкват.jpg |
| Щавелевый | Щавелевый лимонад _ Sorrel lemonade.jpg |
| Фреш | fresh.jpg |
| Коктейль | Smooth, creamy, and effortlessly classic 🤍_Our Vanilla Shake...__ناع.jpg |
| Французский Завтрак | frantsuzskiy-zavtrak.jpg |
| Сырники со Сметаной | syrniki-so-smetanoy.jpg |
| Скрэмбл с Лососем | skrembl-s-lososem.jpg |
| Гранола с Йогуртом | granola-s-yogurtom.jpg |
| Каша рисово-кокосовая | kasha-risovo-kokosovaya.jpg |
| Сэндвич с Курицей | sendvich-s-kuritsey.jpg |
| Круассан с Лососем | kruassan-s-lososem.jpg |
| Брускетта с Томатами | brusketta-s-tomatami.jpg |
| Тост с Авокадо | tost-s-avokado.jpg |
| Салат с Грушей и Горгонзолой | salat-s-grushey-i-gorgonzoloy.jpg |
| Цезарь с Курицей | tsezar-s-kuritsey.jpg |
| Тыквенный Суп-Крем | tykvennyy-sup-krem.jpg |
| Томатный Суп с Базиликом | tomatnyy-sup-s-bazilikom.jpg |

</details>

---

## Текущее состояние (2026-06-23)

### ✅ Готово
- **Два JSON-файла** — `menu.json` (iiko) + `content.json` (редакция), мерж в JS
- Динамические табы, категории, товары
- Система аддонов (toggle + choice, required, цены по размерам)
- Маппинг изображений в JS (iiko не участвует)
- Адаптивная сетка 2 колонки на всех экранах
- Модалка кастомизации с прокруткой
- Корзина с количеством, дедупликацией и **localStorage-персистентностью**
- iOS-фиксы (hover, tap, focus, скролл)
- Stagger-анимация при переключении табов
- Time-based приветствие в хедере
- Микро-анимация при добавлении в корзину
- **Loading skeleton** — 6 карточек с shimmer-анимацией на время загрузки данных
- **Оптимизация аддонов** — toggle без перерисовки DOM, choice — только своя секция
- **Обработка битых картинок** — onerror fallback на всех изображениях
- **Секции через tab IDs** — явное сопоставление, а не исключение ключей
- **Логотип локально** — скачан с tildacdn, хостится в `images/logo.svg`
- **Персистентность табов** — активный таб сохраняется в localStorage
- **Idle timer** — 60 секунд бездействия → сброс корзины + модалок + табов
- **Kiosk-защита** — глобальные `touch-action: manipulation`, `user-select: none`
- **Momentum-скролл** — `-webkit-overflow-scrolling: touch` на модалках
- **Чистота кода** — удалён мёртвый код (renderIcon, currentCategory, multiple dead CSS, `.modal-sizes` в HTML, badge modifier класс в JS)
- **Кухонные фото** — все изображения добавлены в маппинг

### 🚫 Осознанные ограничения/решения
- **iiko генерирует только menu.json** — изображения в JS-маппинге, описания и конфигурация аддонов в content.json
- **Поле "Имя" при оформлении** — требует текстового ввода (плохо для киоска). Будет заменено на кнопки или QR при появлении бэкенда.
- **"Оформить заказ"** пока просто очищает корзину (нет отправки)
- **Нет Service Worker** — при падении сервера меню недоступно
- **Нет полноценной a11y** — минимальные aria-атрибуты

### 📝 user-edits меню
Пользователь вручную упростил `addons` у некоторых товаров:
- Американо, Фильтр, Чай, Эспрессо Тоник, Колд-брю Кола — `addons: []`
- Капучино, Флэт Уайт — только `syrup`, `milk` (без `protein`)
- Бамбл — `matcha`, `syrup` (без `milk`)
- **НЕ МЕНЯТЬ** эти упрощения без явной просьбы пользователя.

---

## Локальный запуск

```bash
python3 -m http.server 8000
```

Доступно на `http://localhost:8000`.
Для внешнего доступа — Serveo: `ssh -R 80:localhost:8000 serveo.net`.
