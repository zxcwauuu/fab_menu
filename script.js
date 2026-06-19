document.addEventListener('DOMContentLoaded', async () => {
    // ====== ЗАГРУЗКА ДАННЫХ ======
    let menuData, addonsData;

    let contentData;

    try {
        const [menuRes, contentRes] = await Promise.all([
            fetch('menu.json'),
            fetch('content.json')
        ]);
        if (!menuRes.ok) throw new Error(`menu.json HTTP ${menuRes.status}`);
        if (!contentRes.ok) throw new Error(`content.json HTTP ${contentRes.status}`);

        const json = await menuRes.json();
        contentData = await contentRes.json();

        addonsData = contentData.addons || {};
        menuData = {};

        // Все ключи, кроме tabs — это секции меню
        const metaKeys = ['tabs'];
        for (const key of Object.keys(json)) {
            if (!metaKeys.includes(key)) {
                menuData[key] = json[key];
            }
        }
        // Сохраняем мета-данные для рендера
        menuData.tabs = json.tabs || [];

        // Сливаем описания и бейджи из content.json в каждый товар
        const contentItems = contentData.items || {};
        menuData.badges = contentData.badges || {};

        for (const sectionKey of Object.keys(menuData)) {
            if (sectionKey === 'tabs') continue;
            const categories = menuData[sectionKey];
            if (!Array.isArray(categories)) continue;
            for (const cat of categories) {
                if (!cat.items) continue;
                for (const item of cat.items) {
                    const content = contentItems[item.name] || {};

                    // Описания и бейдж — из content.json
                    if (content.desc !== undefined) item.desc = content.desc;
                    if (content.detailed !== undefined) item.detailed = content.detailed;
                    if (content.badge) item.badge = content.badge;

                    // priceDisplay — выводим из первого размера, если не задан
                    if (!item.priceDisplay && item.sizes && item.sizes.length > 0) {
                        item.priceDisplay = item.sizes[0];
                    }
                }
            }
        }
    } catch (err) {
        console.error('Не удалось загрузить данные:', err);
        document.querySelectorAll('.menu__content').forEach(el => {
            el.innerHTML = '<p style="text-align:center;padding:60px 0;color:#999;">Не удалось загрузить меню. Попробуйте обновить страницу.</p>';
        });
        return;
    }

    // ====== МАППИНГ ИЗОБРАЖЕНИЙ (iiko не передаёт фото в JSON) ======
    const itemImages = {
        "Эспрессо": "Espresso.jpg",
        "Американо": "Americano.jpg",
        "Фильтр": "фильтр кофе.jpg",
        "Капучино": "Cappuccino.jpg",
        "Латте": "Latte.jpg",
        "Флэт Уайт": "Flat White.jpg",
        "Раф": "Раф.jpg",
        "Какао": "какао.jpg",
        "Чай": "tea.jpg",
        "Малина Имбирь": "малина-имбирь.jpg",
        "Глинтвейн Вишнёвый": "Безалкогольный глинтвейн на вишневом соке — рецепт с фото.jpg",
        "Груша Облепиха": "Облепиховый чай – Рецепт пошагово с фото.jpg",
        "FAB": "ice-coffe.jpg",
        "Эспрессо Тоник": "The Perfect Espresso Tonic Twist.jpg",
        "Колд-брю Кола": "Spiced Vanilla Cold Brew Concentrate.jpg",
        "Бамбл": "Эстетика_ Летний бамбл кофе.jpg",
        "Гранат с Кумкватом": "гранат-кумкват.jpg",
        "Щавелевый": "Щавелевый лимонад _ Sorrel lemonade.jpg",
        "Фреш": "fresh.jpg",
        "Коктейль": "Smooth, creamy, and effortlessly classic 🤍_Our Vanilla Shake is pure indulgence, made simple___Rich vanilla, velvety texture, and a touch of sweetness in every sip…_because sometimes, classic is everything.__ناع.jpg",
    };

    function getItemImage(itemName) {
        return itemImages[itemName] || '';
    }


    // ====== TIME-BASED GREETING ======
    function setTimeGreeting() {
        const h = new Date().getHours();
        let greeting;
        if (h >= 6 && h < 12) greeting = '☀️ Доброе утро';
        else if (h >= 12 && h < 17) greeting = '🌤 Добрый день';
        else if (h >= 17 && h < 22) greeting = '🌙 Добрый вечер';
        else greeting = '✨ Доброй ночи';
        const el = document.querySelector('.header__subtitle');
        if (el) el.textContent = greeting;
    }
    setTimeGreeting();


    // ====== ХЕЛПЕРЫ ======
    // Рендерит иконку из JSON (emoji или SVG)
    function renderIcon(icon) {
        if (!icon) return '';
        if (typeof icon === 'string' && icon.startsWith('<svg')) return icon;
        return '<span class="emoji-icon">' + icon + '</span>';
    }

    function parseSizes(sizes) {
        if (!sizes) return [];
        return sizes.map(s => {
            const m = s.match(/^(\S+)\s*—\s*(\d+)/);
            if (!m) return { size: s, price: 0, label: s };
            return { size: m[1], price: parseInt(m[2]), label: s };
        });
    }

    function formatPrice(n) {
        return n.toLocaleString('ru-RU') + '₽';
    }

    function parseItemBasePrice(priceDisplay) {
        if (!priceDisplay) return 0;
        const m = priceDisplay.match(/(\d+)/);
        return m ? parseInt(m[1]) : 0;
    }

    function getAddonPrice(addon, size) {
        if (addon.flatPrice !== undefined) return addon.flatPrice;
        if (addon.pricesBySize && size && addon.pricesBySize[size] !== undefined) {
            return addon.pricesBySize[size];
        }
        return 0;
    }

    // ====== СОСТОЯНИЕ КОРЗИНЫ ======
    let cart = [];

    function generateCartId(name, size, addons) {
        const addonsKey = addons
            .map(a => a.type + ':' + (a.option || ''))
            .sort()
            .join('|');
        return `${name}|${size || ''}|${addonsKey}`;
    }

    function addToCart(item) {
        const id = generateCartId(item.name, item.size, item.addons);
        const addonsTotal = item.addons.reduce((s, a) => s + a.price, 0);
        const unitPrice = item.basePrice + addonsTotal;

        const existing = cart.find(c => c.id === id);
        if (existing) {
            existing.quantity += item.quantity;
        } else {
            cart.push({
                id,
                name: item.name,
                size: item.size,
                basePrice: item.basePrice,
                addons: item.addons,
                image: getItemImage(item.name),
                quantity: item.quantity,
                unitPrice,
            });
        }
        updateCartUI();
        // Анимация кнопки корзины
        const fab = document.getElementById('cart-fab');
        fab.classList.remove('cart-fab--bounce');
        void fab.offsetHeight;
        fab.classList.add('cart-fab--bounce');

        // Анимация карточки товара
        const cards = document.querySelectorAll('.menu__item');
        const card = Array.from(cards).find(el => el.dataset.name === item.name);
        if (card) {
            card.classList.remove('menu__item--added');
            void card.offsetHeight;
            card.classList.add('menu__item--added');
            setTimeout(() => card.classList.remove('menu__item--added'), 800);
        }
    }

    function removeFromCart(id) {
        cart = cart.filter(c => c.id !== id);
        updateCartUI();
    }

    function updateCartQuantity(id, delta) {
        const item = cart.find(c => c.id === id);
        if (!item) return;
        item.quantity = Math.max(1, item.quantity + delta);
        if (item.quantity === 0) {
            removeFromCart(id);
        } else {
            updateCartUI();
        }
    }

    function getCartTotal() {
        return cart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0);
    }

    function getCartCount() {
        return cart.reduce((sum, c) => sum + c.quantity, 0);
    }

    // ====== UI КОРЗИНЫ ======
    const cartFab = document.getElementById('cart-fab');
    const cartBadge = document.getElementById('cart-badge');
    const cartModal = document.getElementById('cart-modal');
    const cartModalBody = document.getElementById('cart-modal-body');
    const cartModalFooter = document.getElementById('cart-modal-footer');
    const cartModalTotal = document.getElementById('cart-modal-total');
    const cartModalClose = document.getElementById('cart-modal-close');
    const cartModalCheckout = document.getElementById('cart-modal-checkout');
    const checkoutName = document.getElementById('checkout-name');
    const checkoutComment = document.getElementById('checkout-comment');

    function updateCartUI() {
        const count = getCartCount();
        cartBadge.textContent = count;
        cartFab.classList.toggle('cart-fab--visible', count > 0);

        if (cartModal.classList.contains('modal-overlay--open')) {
            renderCartModal();
        }
    }

    function renderCartModal() {
        const count = getCartCount();
        cartModalBody.innerHTML = '';

        if (count === 0) {
            cartModalBody.innerHTML = '<p class="cart-modal-empty">Корзина пуста</p>';
            cartModalFooter.style.display = 'none';
            cartModalCheckout.style.display = 'none';
            return;
        }

        cartModalFooter.style.display = 'block';
        cartModalCheckout.style.display = 'block';

        // Сбрасываем ошибку валидации при перерисовке
        checkoutName.classList.remove('checkout-input--error');
        document.getElementById('checkout-name-err').style.display = 'none';

        cart.forEach(ci => {
            const row = document.createElement('div');
            row.className = 'cart-item';

            let metaParts = [];
            if (ci.size) metaParts.push(ci.size);
            ci.addons.forEach(a => metaParts.push(a.label));

            const meta = metaParts.length ? metaParts.join(' · ') : '';

            // Миниатюра
            if (ci.image) {
                const img = document.createElement('img');
                img.className = 'cart-item__thumb';
                img.src = 'images/' + encodeURIComponent(ci.image);
                img.alt = ci.name;
                row.appendChild(img);
            } else {
                const placeholder = document.createElement('div');
                placeholder.className = 'cart-item__thumb';
                placeholder.style.cssText = 'background:#f5f5f5;border-radius:12px;';
                row.appendChild(placeholder);
            }

            // Инфо
            const info = document.createElement('div');
            info.className = 'cart-item__info';

            const nameEl = document.createElement('div');
            nameEl.className = 'cart-item__name';
            nameEl.textContent = ci.name;
            info.appendChild(nameEl);

            if (meta) {
                const metaEl = document.createElement('div');
                metaEl.className = 'cart-item__meta';
                metaEl.textContent = meta;
                info.appendChild(metaEl);
            }

            const bottom = document.createElement('div');
            bottom.className = 'cart-item__bottom';

            // Qty
            const qty = document.createElement('div');
            qty.className = 'cart-item__qty';

            const minus = document.createElement('button');
            minus.textContent = '−';
            minus.addEventListener('click', () => updateCartQuantity(ci.id, -1));

            const val = document.createElement('span');
            val.textContent = ci.quantity;

            const plus = document.createElement('button');
            plus.textContent = '+';
            plus.addEventListener('click', () => updateCartQuantity(ci.id, 1));

            qty.append(minus, val, plus);
            bottom.appendChild(qty);

            // Price
            const priceEl = document.createElement('span');
            priceEl.className = 'cart-item__price';
            priceEl.textContent = formatPrice(ci.unitPrice * ci.quantity);
            bottom.appendChild(priceEl);

            // Remove
            const removeBtn = document.createElement('button');
            removeBtn.className = 'cart-item__remove';
            removeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
            removeBtn.addEventListener('click', () => removeFromCart(ci.id));

            info.append(bottom);
            row.append(info, removeBtn);
            cartModalBody.appendChild(row);
        });

        cartModalTotal.textContent = formatPrice(getCartTotal());
    }

    cartFab.addEventListener('click', () => {
        renderCartModal();
        cartModal.classList.add('modal-overlay--open');
        document.body.style.overflow = 'hidden';
    });

    cartModalClose.addEventListener('click', closeCartModal);

    document.getElementById('cart-checkout-btn').addEventListener('click', () => {
        const name = checkoutName.value.trim();
        const errEl = document.getElementById('checkout-name-err');

        // Валидация имени
        if (!name) {
            checkoutName.classList.add('checkout-input--error');
            errEl.style.display = 'block';
            checkoutName.focus();
            return;
        }
        checkoutName.classList.remove('checkout-input--error');
        errEl.style.display = 'none';

        const comment = checkoutComment.value.trim();
        const total = formatPrice(getCartTotal());

        // Собираем детали заказа
        const orderItems = cart.map(ci => {
            let parts = [ci.name];
            if (ci.size) parts.push(ci.size);
            ci.addons.forEach(a => parts.push(a.label));
            if (ci.quantity > 1) parts.push('×' + ci.quantity);
            return parts.join(' · ');
        }).join('\n');

        console.log('📋 Новый заказ:');
        console.log('Имя:', name);
        console.log('Комментарий:', comment || '—');
        console.log('Состав:\n' + orderItems);
        console.log('Итого:', total);

        // Показываем success-экран внутри модалки
        const successDiv = document.createElement('div');
        successDiv.className = 'order-success';
        successDiv.innerHTML = `
            <div class="order-success__icon">✓</div>
            <div class="order-success__title">Спасибо, ${name}!</div>
            <div class="order-success__subtitle">Заказ принят. Мы уже готовим для вас.</div>
            <button class="order-success__btn" id="order-success-close">Отлично</button>
        `;
        cartModal.querySelector('.modal-card').appendChild(successDiv);

        successDiv.querySelector('#order-success-close').addEventListener('click', () => {
            cart = [];
            updateCartUI();
            closeCartModal();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });

    cartModal.addEventListener('click', e => {
        if (e.target === cartModal) closeCartModal();
    });

    function closeCartModal() {
        cartModal.classList.remove('modal-overlay--open');
        document.body.style.overflow = '';
        // Скрываем и сбрасываем форму оформления
        cartModalCheckout.style.display = 'none';
        checkoutName.value = '';
        checkoutComment.value = '';
        checkoutName.classList.remove('checkout-input--error');
        const errEl = document.getElementById('checkout-name-err');
        if (errEl) errEl.style.display = 'none';
        // Убираем success-экран, если был
        const existingSuccess = document.querySelector('.order-success');
        if (existingSuccess) existingSuccess.remove();
    }

    // Единый обработчик Escape
    // Фикс для iOS — убирает залипание focus/active состояния после тапа
    document.addEventListener('touchstart', function(){}, {passive: true});
    document.addEventListener('touchend', function(e) {
        if (e.target.closest('button')) {
            setTimeout(() => document.activeElement?.blur(), 100);
        }
    }, {passive: true});

    const keyHandler = e => {
        if (e.key === 'Escape') {
            if (modal.classList.contains('modal-overlay--open')) {
                closeModal();
            } else if (cartModal.classList.contains('modal-overlay--open')) {
                closeCartModal();
            }
        }
    };
    document.removeEventListener('keydown', keyHandler);
    document.addEventListener('keydown', keyHandler);

    // ====== РЕНДЕР МЕНЮ ======
    function renderCategory(cat) {
        const wrapper = document.createElement('div');
        wrapper.className = 'menu__category';

        const title = document.createElement('h2');
        title.className = 'menu__category-title';
        title.textContent = cat.title;
        wrapper.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'menu__items' + (cat.addon ? ' menu__items--addons' : '');
        wrapper.appendChild(grid);

        // Пропускаем категорию-заглушку для аддонов (их больше нет в bar)
        if (cat.addon) {
            const note = document.createElement('p');
            note.style.cssText = 'grid-column:1/-1;color:#999;font-size:13px;padding:12px 0;text-align:center;';
            note.textContent = 'Добавки теперь можно выбрать при заказе напитка.';
            grid.appendChild(note);
            return wrapper;
        }

        cat.items.forEach((item, idx) => {
            const el = document.createElement('div');
            const hasImage = !!getItemImage(item.name);

            let cls = 'menu__item';
            if (hasImage) cls += ' menu__item--has-image';
            el.className = cls;
            el.dataset.name = item.name;

            // Изображение
            if (hasImage) {
                const img = document.createElement('img');
                img.className = 'menu__item-thumb';
                img.src = 'images/' + encodeURIComponent(getItemImage(item.name));
                img.alt = item.name;
                img.loading = 'lazy';
                img.decoding = 'async';
                el.appendChild(img);
            }

            // Инфо-блок
            const info = document.createElement('div');
            info.className = 'menu__item-info';

            const nameEl = document.createElement('h3');
            nameEl.className = 'menu__item-title';
            nameEl.textContent = item.name;

            if (item.badge && menuData.badges && menuData.badges[item.badge]) {
                const badgeDef = menuData.badges[item.badge];
                const badge = document.createElement('span');
                badge.className = 'menu__item-badge menu__item-badge--' + item.badge;
                badge.textContent = badgeDef.text;
                nameEl.appendChild(badge);
            }

            const desc = document.createElement('p');
            desc.className = 'menu__item-desc';
            desc.textContent = item.desc;

            const price = document.createElement('span');
            price.className = 'menu__item-price';
            price.textContent = item.priceDisplay;

            info.append(nameEl, desc, price);
            el.appendChild(info);
            grid.appendChild(el);

            // Клик — открыть модалку кастомизации
            el.addEventListener('click', () => openItemModal(item, cat.title));
        });

        return wrapper;
    }

    function renderAll() {
        for (const tabDef of (menuData.tabs || [])) {
            const tabId = tabDef.id;
            const categories = menuData[tabId];
            if (!categories) continue;
            const container = document.getElementById('tab-' + tabId);
            if (!container) continue;
            container.innerHTML = '';
            categories.forEach(cat => container.appendChild(renderCategory(cat)));
        }
    }

    renderAll();

    // ====== ТАБЫ (динамические из JSON) ======
    const tabsContainer = document.querySelector('.menu__tabs');
    const menuSection = document.querySelector('.menu');

    // Создаём контейнеры контента и кнопки табов
    const tabButtons = [];
    const contents = {};
    let firstTabId = null;

    menuData.tabs.forEach(tabDef => {
        const id = tabDef.id;
        if (!firstTabId) firstTabId = id;

        // Кнопка таба
        const btn = document.createElement('button');
        btn.className = 'menu__tab' + (id === firstTabId ? ' menu__tab--active' : '');
        btn.dataset.tab = id;
        btn.setAttribute('aria-pressed', id === firstTabId ? 'true' : 'false');
        btn.innerHTML = '<span class="menu__tab-icon">' + tabDef.icon + '</span>' + tabDef.title;
        tabsContainer.appendChild(btn);
        tabButtons.push(btn);

        // Контейнер контента (если ещё нет в HTML)
        let contentEl = document.getElementById('tab-' + id);
        if (!contentEl) {
            contentEl = document.createElement('div');
            contentEl.className = 'menu__content' + (id === firstTabId ? ' menu__content--active' : '');
            contentEl.id = 'tab-' + id;
            menuSection.appendChild(contentEl);
        } else {
            contentEl.classList.toggle('menu__content--active', id === firstTabId);
        }
        contents[id] = contentEl;
    });

    function animateItems(container) {
        const items = container.querySelectorAll('.menu__item');
        items.forEach((item, i) => {
            item.style.setProperty('--i', i);
            item.classList.remove('menu__item--stagger');
        });
        void container.offsetHeight;
        items.forEach(item => {
            item.classList.add('menu__item--stagger');
        });
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            tabButtons.forEach(t => {
                t.classList.remove('menu__tab--active');
                t.setAttribute('aria-pressed', 'false');
            });
            btn.classList.add('menu__tab--active');
            btn.setAttribute('aria-pressed', 'true');
            Object.keys(contents).forEach(key => {
                if (contents[key]) contents[key].classList.toggle('menu__content--active', key === target);
            });
            animateItems(contents[target]);
        });
    });

    if (firstTabId && contents[firstTabId]) animateItems(contents[firstTabId]);

    // ====== МОДАЛКА КАСТОМИЗАЦИИ ======
    const modal = document.getElementById('item-modal');
    const modalImg = modal.querySelector('.modal-image');
    const modalBody = modal.querySelector('.modal-body');
    const modalClose = modal.querySelector('.modal-close');

    let currentItem = null;
    let currentCategory = '';
    let selectedSize = null;
    let selectedAddons = {};
    let itemQuantity = 1;
    let currentBasePrice = 0;

    // Парсим доступные размеры
    let availableSizes = [];

    function resetModalState() {
        currentItem = null;
        currentCategory = '';
        selectedSize = null;
        selectedAddons = {};
        itemQuantity = 1;
        availableSizes = [];
        currentBasePrice = 0;
    }

    function openItemModal(item, category) {
        resetModalState();
        currentItem = item;
        currentCategory = category;
        availableSizes = parseSizes(item.sizes || []);
        selectedSize = availableSizes.length > 0 ? availableSizes[0] : null;
        currentBasePrice = availableSizes.length > 0
            ? (selectedSize ? selectedSize.price : 0)
            : parseItemBasePrice(item.priceDisplay);
        itemQuantity = 1;
        selectedAddons = {};

        buildModalContent();
        modal.classList.add('modal-overlay--open');
        document.body.style.overflow = 'hidden';
    }

    function calcTotal() {
        const base = currentBasePrice;
        const addonsTotal = Object.values(selectedAddons).reduce((sum, a) => sum + (a.price || 0), 0);
        return (base + addonsTotal) * itemQuantity;
    }

    function buildModalContent() {
        const item = currentItem;
        if (!item) return;
        const isBar = availableSizes.length > 0;

        // Изображение
        if (getItemImage(item.name)) {
            modalImg.src = 'images/' + encodeURIComponent(getItemImage(item.name));
            modalImg.alt = item.name;
            modalImg.style.display = 'block';
        } else {
            modalImg.style.display = 'none';
        }

        // === Строим тело модалки ===
        modalBody.innerHTML = '';

        // ----- Заголовок + цена -----
        const headerSection = document.createElement('div');

        const titleEl = document.createElement('h2');
        titleEl.className = 'modal-title';
        if (item.badge && menuData.badges && menuData.badges[item.badge]) {
            const bd = menuData.badges[item.badge];
            titleEl.innerHTML = item.name + ' <span class="menu__item-badge">' + bd.text + '</span>';
        } else {
            titleEl.textContent = item.name;
        }
        headerSection.appendChild(titleEl);

        const priceEl = document.createElement('span');
        priceEl.className = 'modal-price';
        priceEl.id = 'modal-main-price';
        priceEl.textContent = selectedSize ? formatPrice(selectedSize.price) : item.priceDisplay;
        headerSection.appendChild(priceEl);

        // Краткое описание
        if (item.detailed) {
            const desc = document.createElement('p');
            desc.className = 'modal-desc';
            desc.textContent = item.detailed;
            headerSection.appendChild(desc);
        }

        modalBody.appendChild(headerSection);

        // ----- Выбор размера (только для бара) -----
        if (isBar) {
            const sizeSection = document.createElement('div');
            sizeSection.className = 'modal-section';

            const sizeLabel = document.createElement('div');
            sizeLabel.className = 'modal-section__label';
            sizeLabel.textContent = 'Объём';
            sizeSection.appendChild(sizeLabel);

            const sizeSel = document.createElement('div');
            sizeSel.className = 'size-selector';

            availableSizes.forEach(s => {
                const btn = document.createElement('button');
                btn.className = 'size-btn' + (s.size === selectedSize.size ? ' size-btn--active' : '');
                btn.innerHTML = '<span class="size-btn__name">' + s.size + '</span><span class="size-btn__price">' + formatPrice(s.price) + '</span>';
                btn.addEventListener('click', () => {
                    selectedSize = s;
                    currentBasePrice = s.price;
                    // Обновляем активный класс
                    sizeSel.querySelectorAll('.size-btn').forEach(b => b.classList.remove('size-btn--active'));
                    btn.classList.add('size-btn--active');
                    // Обновляем цены аддонов, зависящих от размера
                    renderAddonSections();
                    updateTotals();
                });
                sizeSel.appendChild(btn);
            });

            sizeSection.appendChild(sizeSel);
            modalBody.appendChild(sizeSection);
        }

        // ----- Аддоны (только для бара) -----
        if (isBar) {
            // Контейнер для секций аддонов — будем перерисовывать при смене размера
            const addonsContainer = document.createElement('div');
            addonsContainer.id = 'modal-addons';
            modalBody.appendChild(addonsContainer);
            renderAddonSections();
        }

        // ----- Количество -----
        const qtySection = document.createElement('div');
        qtySection.className = 'modal-section';
        qtySection.style.borderTop = '1px solid rgba(61, 22, 47, 0.08)';
        qtySection.style.paddingTop = '20px';
        qtySection.style.marginTop = '20px';

        const qtyLabel = document.createElement('div');
        qtyLabel.className = 'modal-section__label';
        qtyLabel.textContent = 'Количество';
        qtySection.appendChild(qtyLabel);

        const qtyCtrl = document.createElement('div');
        qtyCtrl.className = 'qty-wrapper';

        const qtyGroup = document.createElement('div');
        qtyGroup.className = 'qty-control';

        const minusBtn = document.createElement('button');
        minusBtn.className = 'qty-btn';
        minusBtn.textContent = '−';
        minusBtn.disabled = true;
        minusBtn.addEventListener('click', () => {
            if (itemQuantity > 1) {
                itemQuantity--;
                qtyVal.textContent = itemQuantity;
                minusBtn.disabled = itemQuantity <= 1;
                updateTotals();
            }
        });

        const qtyVal = document.createElement('span');
        qtyVal.className = 'qty-value';
        qtyVal.textContent = itemQuantity;

        const plusBtn = document.createElement('button');
        plusBtn.className = 'qty-btn';
        plusBtn.textContent = '+';
        plusBtn.addEventListener('click', () => {
            itemQuantity++;
            qtyVal.textContent = itemQuantity;
            minusBtn.disabled = false;
            updateTotals();
        });

        qtyGroup.append(minusBtn, qtyVal, plusBtn);
        qtyCtrl.appendChild(qtyGroup);
        qtySection.appendChild(qtyCtrl);
        modalBody.appendChild(qtySection);

        // ----- Кнопка «В корзину» -----
        const addSection = document.createElement('div');
        addSection.className = 'modal-section';

        const addBtn = document.createElement('button');
        addBtn.className = 'add-to-cart';
        addBtn.id = 'modal-add-btn';

        const totalSpan = document.createElement('span');
        totalSpan.id = 'modal-total-display';
        addBtn.innerHTML = '<span>Добавить в корзину</span> <span class="add-to-cart__price" id="modal-total-price">' + formatPrice(calcTotal()) + '</span>';
        addBtn.addEventListener('click', () => {
            const addonsList = Object.values(selectedAddons).filter(a => a.selected);
            const image = getItemImage(item.name);
            addToCart({
                name: item.name,
                size: selectedSize ? selectedSize.size : '',
                basePrice: currentBasePrice,
                addons: addonsList,
                image,
                quantity: itemQuantity,
            });
            closeModal();
        });
        addSection.appendChild(addBtn);
        modalBody.appendChild(addSection);
    }

    function renderAddonSections() {
        const container = document.getElementById('modal-addons');
        if (!container) return;
        container.innerHTML = '';

        const allowedKeys = currentItem.addons;
        if (!Array.isArray(allowedKeys) || allowedKeys.length === 0) return;

        // Разделяем на toggle и choice аддоны
        const toggleKeys = allowedKeys.filter(k => addonsData[k]?.type === 'toggle');
        const choiceKeys = allowedKeys.filter(k => addonsData[k]?.type === 'choice');

        // === Toggle-аддоны (компактные чипсы) ===
        if (toggleKeys.length > 0) {
            const sec = document.createElement('div');
            sec.className = 'modal-section';

            const label = document.createElement('div');
            label.className = 'modal-section__label';
            label.textContent = 'Добавки';
            sec.appendChild(label);

            const chips = document.createElement('div');
            chips.className = 'choice-chips';

            toggleKeys.forEach(key => {
                const def = addonsData[key];
                const cur = selectedAddons[key];
                const isActive = cur?.selected || false;
                const price = getAddonPrice(def, selectedSize?.size);

                const chip = document.createElement('button');
                chip.className = 'choice-chip' + (isActive ? ' choice-chip--active' : '');

                const priceLabel = price > 0 ? ' <span class="choice-chip__price">+' + price + '₽</span>' : '';

                chip.innerHTML = '<span>' + def.name + '</span>' + priceLabel;

                chip.addEventListener('click', () => {
                    if (!isActive) {
                        selectedAddons[key] = {
                            type: key,
                            label: def.name + (price > 0 ? ' +' + price + '₽' : ''),
                            price,
                            selected: true,
                        };
                    } else {
                        delete selectedAddons[key];
                    }
                    renderAddonSections();
                    updateTotals();
                });
                chips.appendChild(chip);
            });

            sec.appendChild(chips);
            container.appendChild(sec);
        }

        // === Choice-аддоны (каждый — своя секция с опциями) ===
        choiceKeys.forEach(key => {
            const def = addonsData[key];
            if (!def || !Array.isArray(def.options)) return;

            // Обязательный выбор — предвыбираем первый вариант
            if (def.required && !selectedAddons[key]) {
                const firstOpt = def.options[0];
                const price = getAddonPrice(def, selectedSize?.size);
                selectedAddons[key] = {
                    type: key,
                    option: firstOpt,
                    label: def.name + ' — ' + firstOpt,
                    price,
                    selected: true,
                };
            }

            const sec = document.createElement('div');
            sec.className = 'modal-section';

            const label = document.createElement('div');
            label.className = 'modal-section__label';
            label.textContent = def.name;
            sec.appendChild(label);

            const chips = document.createElement('div');
            chips.className = 'choice-chips';

            def.options.forEach(opt => {
                const price = getAddonPrice(def, selectedSize?.size);
                const cur = selectedAddons[key];
                const isSelected = cur?.option === opt;

                const chip = document.createElement('button');
                chip.className = 'choice-chip' + (isSelected ? ' choice-chip--active' : '');

                chip.innerHTML = '<span>' + opt + '</span>' + (price > 0 ? ' <span class="choice-chip__price">+' + price + '₽</span>' : '');

                chip.addEventListener('click', () => {
                    if (isSelected) {
                        delete selectedAddons[key];
                    } else {
                        selectedAddons[key] = {
                            type: key,
                            option: opt,
                            label: def.name + ' — ' + opt,
                            price,
                            selected: true,
                        };
                    }
                    renderAddonSections();
                    updateTotals();
                });
                chips.appendChild(chip);
            });

            sec.appendChild(chips);
            container.appendChild(sec);
        });
    }

    function updateTotals() {
        const priceEl = document.getElementById('modal-main-price');
        if (priceEl && selectedSize) {
            priceEl.textContent = formatPrice(selectedSize.price);
        }

        const totalPriceEl = document.getElementById('modal-total-price');
        if (totalPriceEl) {
            totalPriceEl.textContent = formatPrice(calcTotal());
        }
    }

    // ====== ЗАКРЫТИЕ МОДАЛКИ ======
    function closeModal() {
        modal.classList.remove('modal-overlay--open');
        document.body.style.overflow = '';
        resetModalState();
    }

    modalClose.addEventListener('click', closeModal);

    modal.addEventListener('click', e => {
        if (e.target === modal) closeModal();
    });
});
