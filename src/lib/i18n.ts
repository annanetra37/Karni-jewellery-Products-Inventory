export const LOCALES = ['en', 'hy', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'EN',
  hy: 'ՀՅ',
  ru: 'РУ',
};
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  hy: 'Հայերեն',
  ru: 'Русский',
};

const D: Record<string, Record<Locale, string>> = {
  // Common
  'c.save': { en: 'Save', hy: 'Պահպանել', ru: 'Сохранить' },
  'c.saveChanges': { en: 'Save changes', hy: 'Պահպանել փոփոխությունները', ru: 'Сохранить изменения' },
  'c.cancel': { en: 'Cancel', hy: 'Չեղարկել', ru: 'Отмена' },
  'c.delete': { en: 'Delete', hy: 'Ջնջել', ru: 'Удалить' },
  'c.remove': { en: 'Remove', hy: 'Հեռացնել', ru: 'Удалить' },
  'c.add': { en: 'Add', hy: 'Ավելացնել', ru: 'Добавить' },
  'c.edit': { en: 'Edit', hy: 'Խմբագրել', ru: 'Изменить' },
  'c.confirm': { en: 'Confirm', hy: 'Հաստատել', ru: 'Подтвердить' },
  'c.done': { en: 'Done', hy: 'Ավարտել', ru: 'Готово' },
  'c.selected': { en: 'selected', hy: 'ընտրված', ru: 'выбрано' },
  'c.back': { en: 'Back', hy: 'Հետ', ru: 'Назад' },
  'c.next': { en: 'Next', hy: 'Հաջորդ', ru: 'Далее' },
  'c.prev': { en: 'Prev', hy: 'Նախորդ', ru: 'Назад' },
  'c.search': { en: 'Search', hy: 'Որոնում', ru: 'Поиск' },
  'c.loading': { en: 'Loading…', hy: 'Բեռնվում է…', ru: 'Загрузка…' },
  'c.processing': { en: 'Processing…', hy: 'Կատարվում է…', ru: 'Обработка…' },
  'c.saving': { en: 'Saving…', hy: 'Պահպանվում է…', ru: 'Сохранение…' },
  'c.reset': { en: 'Reset filters', hy: 'Մաքրել զտիչները', ru: 'Сбросить фильтры' },
  'c.note': { en: 'Note', hy: 'Նշում', ru: 'Заметка' },
  'c.noteOptional': { en: 'Note (optional)', hy: 'Նշում (ոչ պարտադիր)', ru: 'Заметка (необязательно)' },
  'c.quantity': { en: 'Quantity', hy: 'Քանակ', ru: 'Количество' },
  'c.qty': { en: 'Qty', hy: 'Քանակ', ru: 'Кол-во' },
  'c.price': { en: 'Price', hy: 'Գին', ru: 'Цена' },
  'c.priceAmd': { en: 'Price (AMD)', hy: 'Գին (֏)', ru: 'Цена (֏)' },
  'c.cost': { en: 'Cost', hy: 'Արժեք', ru: 'Себестоимость' },
  'c.size': { en: 'Size', hy: 'Չափս', ru: 'Размер' },
  'c.color': { en: 'Color', hy: 'Գույն', ru: 'Цвет' },
  'c.category': { en: 'Category', hy: 'Կատեգորիա', ru: 'Категория' },
  'c.collection': { en: 'Collection', hy: 'Հավաքածու', ru: 'Коллекция' },
  'c.subcollection': { en: 'Subcollection', hy: 'Ենթահավաքածու', ru: 'Подколлекция' },
  'c.anySubcollection': { en: 'Any subcollection', hy: 'Ցանկացած ենթահավաքածու', ru: 'Любая подколлекция' },
  'c.allCategories': { en: 'All categories', hy: 'Բոլոր կատեգորիաները', ru: 'Все категории' },
  'c.anySize': { en: 'Any size', hy: 'Ցանկացած չափս', ru: 'Любой размер' },
  'c.allSellingPoints': { en: 'All selling points', hy: 'Բոլոր վաճառակետերը', ru: 'Все точки продаж' },
  'c.sellingPoint': { en: 'Selling point', hy: 'Վաճառակետ', ru: 'Точка продаж' },
  'c.inStockOnly': { en: 'In stock only', hy: 'Միայն առկա', ru: 'Только в наличии' },
  'c.stock': { en: 'Stock', hy: 'Մնացորդ', ru: 'Остаток' },
  'c.stockAll': { en: 'All stock', hy: 'Բոլորը', ru: 'Все' },
  'c.stockIn': { en: 'In stock', hy: 'Առկա', ru: 'В наличии' },
  'c.stockOut': { en: 'Out of stock', hy: 'Չկա', ru: 'Нет в наличии' },
  'c.outOfStock': { en: 'Out of stock', hy: 'Չկա', ru: 'Нет в наличии' },
  'c.low': { en: 'Low', hy: 'Քիչ', ru: 'Мало' },
  'c.inStock': { en: 'in stock', hy: 'առկա', ru: 'в наличии' },
  'c.items': { en: 'items', hy: 'միավոր', ru: 'шт.' },
  'c.item': { en: 'item', hy: 'միավոր', ru: 'шт.' },
  'c.showing': { en: 'Showing', hy: 'Ցուցադրվում է', ru: 'Показано' },
  'c.of': { en: 'of', hy: 'ընդհանուր', ru: 'из' },
  'c.noMatches': { en: 'No matches', hy: 'Համընկնումներ չկան', ru: 'Совпадений нет' },
  'c.noResults': { en: 'No results.', hy: 'Արդյունքներ չկան։', ru: 'Нет результатов.' },
  'c.page': { en: 'Page', hy: 'Էջ', ru: 'Стр.' },
  'c.searchPlaceholder': {
    en: 'Search SKU, design, color, letter, barcode…',
    hy: 'Որոնել SKU, դիզայն, գույն, տառ, շտրիխկոդ…',
    ru: 'Поиск SKU, дизайн, цвет, буква, штрихкод…',
  },

  // App bar
  'ab.notifications': { en: 'Notifications', hy: 'Ծանուցումներ', ru: 'Уведомления' },
  'ab.logout': { en: 'Logout', hy: 'Ելք', ru: 'Выйти' },
  'ab.back': { en: 'Back to home', hy: 'Վերադառնալ գլխավոր', ru: 'На главную' },
  'ab.language': { en: 'Language', hy: 'Լեզու', ru: 'Язык' },

  // Bottom nav
  'nav.sell': { en: 'Sell', hy: 'Վաճառք', ru: 'Продажа' },
  'nav.catalog': { en: 'Catalog', hy: 'Կատալոգ', ru: 'Каталог' },
  'nav.receive': { en: 'Receive', hy: 'Ընդունել', ru: 'Приём' },
  'nav.kacca': { en: 'Kacca', hy: 'Դրամարկղ', ru: 'Касса' },
  'nav.orders': { en: 'Orders', hy: 'Պատվերներ', ru: 'Заказы' },

  // Home
  'h.welcome': { en: 'Welcome back,', hy: 'Բարի վերադարձ,', ru: 'С возвращением,' },
  'h.signedInAs': { en: 'Signed in as', hy: 'Մուտք գործած է որպես', ru: 'Вход выполнен как' },
  'h.salesToday': { en: 'Sales today', hy: 'Վաճառքները այսօր', ru: 'Продажи сегодня' },
  'h.revenueToday': { en: 'Revenue today', hy: 'Շրջանառությունը այսօր', ru: 'Выручка сегодня' },
  'h.shiftOpenAt': { en: 'Shift open at', hy: 'Հերթափոխը բացված է՝', ru: 'Смена открыта в' },
  'h.openingCount': { en: 'Opening count', hy: 'Բացման մնացորդը', ru: 'Открывающий остаток' },
  'h.started': { en: 'started', hy: 'սկսված', ru: 'начата' },
  'h.noShift': { en: 'No shift open', hy: 'Բաց հերթափոխ չկա', ru: 'Смена не открыта' },
  'h.tapToStart': {
    en: 'Tap to start your kacca and begin selling.',
    hy: 'Հպեք՝ դրամարկղը բացելու և վաճառքը սկսելու համար։',
    ru: 'Нажмите, чтобы открыть кассу и начать продажи.',
  },
  'h.startSale': { en: 'Start a sale', hy: 'Սկսել վաճառք', ru: 'Начать продажу' },
  'h.receiveStock': { en: 'Receive stock', hy: 'Ընդունել ապրանք', ru: 'Принять товар' },
  'h.newOrder': { en: 'New order', hy: 'Նոր պատվեր', ru: 'Новый заказ' },
  'h.customers': { en: 'Customers', hy: 'Հաճախորդներ', ru: 'Клиенты' },
  'h.admin': { en: 'Admin', hy: 'Ադմին', ru: 'Админ' },
  'h.lowOrOut': { en: 'low / out', hy: 'քիչ / վերջացած', ru: 'мало / нет' },
  'h.users': { en: 'Users', hy: 'Օգտվողներ', ru: 'Пользователи' },
  'h.products': { en: 'Products', hy: 'Ապրանքներ', ru: 'Товары' },
  'h.inventory': { en: 'Inventory', hy: 'Պահեստ', ru: 'Склад' },
  'h.collectionPhotos': { en: 'Collection photos', hy: 'Հավաքածուի լուսանկարներ', ru: 'Фото коллекций' },
  'h.categoryPhotos': { en: 'Category photos', hy: 'Կատեգորիայի լուսանկարներ', ru: 'Фото категорий' },
  'h.reports': { en: 'Reports', hy: 'Հաշվետվություններ', ru: 'Отчёты' },

  // Login
  'l.signInToContinue': { en: 'Sign in to continue.', hy: 'Մուտք գործեք՝ շարունակելու համար։', ru: 'Войдите, чтобы продолжить.' },
  'l.email': { en: 'Email', hy: 'Էլ. հասցե', ru: 'Эл. почта' },
  'l.password': { en: 'Password', hy: 'Գաղտնաբառ', ru: 'Пароль' },
  'l.signIn': { en: 'Sign in', hy: 'Մուտք', ru: 'Войти' },
  'l.wrong': { en: 'Wrong email or password.', hy: 'Սխալ էլ. հասցե կամ գաղտնաբառ։', ru: 'Неверный email или пароль.' },

  // Invite / password
  'p.changePassword': { en: 'Change password', hy: 'Փոխել գաղտնաբառը', ru: 'Сменить пароль' },
  'p.currentPassword': { en: 'Current password', hy: 'Ընթացիկ գաղտնաբառ', ru: 'Текущий пароль' },
  'p.newPassword': { en: 'New password', hy: 'Նոր գաղտնաբառ', ru: 'Новый пароль' },
  'p.confirmPassword': { en: 'Confirm new password', hy: 'Հաստատեք նոր գաղտնաբառը', ru: 'Подтвердите новый пароль' },
  'p.updatePassword': { en: 'Update password', hy: 'Թարմացնել գաղտնաբառը', ru: 'Обновить пароль' },
  'p.passwordUpdated': { en: 'Password updated.', hy: 'Գաղտնաբառը թարմացվեց։', ru: 'Пароль обновлён.' },
  'p.wrongCurrent': { en: 'Current password is incorrect.', hy: 'Ընթացիկ գաղտնաբառը սխալ է։', ru: 'Текущий пароль неверен.' },
  'p.tooShort': { en: 'New password must be at least 8 characters.', hy: 'Նոր գաղտնաբառը պետք է լինի առնվազն 8 նիշ։', ru: 'Новый пароль должен быть не менее 8 символов.' },
  'p.mismatch': { en: 'New passwords do not match.', hy: 'Գաղտնաբառերը չեն համընկնում։', ru: 'Пароли не совпадают.' },
  'p.atLeast8': { en: 'At least 8 characters.', hy: 'Առնվազն 8 նիշ։', ru: 'Минимум 8 символов.' },

  // Sell
  's.title': { en: 'Sell', hy: 'Վաճառք', ru: 'Продажа' },
  's.findProduct': { en: 'Find a product', hy: 'Գտնել ապրանք', ru: 'Найти товар' },
  's.addAnother': { en: '+ Add another item', hy: '+ Ավելացնել ևս մեկ ապրանք', ru: '+ Добавить ещё товар' },
  's.browse': { en: 'Browse', hy: 'Թերթել', ru: 'Обзор' },
  's.searchFilter': { en: 'Search & filter', hy: 'Որոնում և զտում', ru: 'Поиск и фильтры' },
  's.cart': { en: 'Cart', hy: 'Զամբյուղ', ru: 'Корзина' },
  's.clear': { en: 'Clear', hy: 'Մաքրել', ru: 'Очистить' },
  's.subtotal': { en: 'Subtotal', hy: 'Ենթագումար', ru: 'Подытог' },
  's.paymentMethod': { en: 'Payment method', hy: 'Վճարման եղանակ', ru: 'Способ оплаты' },
  's.pmCash': { en: 'CASH', hy: 'Կանխիկ', ru: 'Наличные' },
  's.pmCard': { en: 'CARD', hy: 'Քարտ', ru: 'Карта' },
  's.pmTransfer': { en: 'TRANSFER', hy: 'Փոխանցում', ru: 'Перевод' },
  's.pmOther': { en: 'OTHER', hy: 'Այլ', ru: 'Другое' },
  's.customer': { en: 'Customer', hy: 'Հաճախորդ', ru: 'Клиент' },
  's.findCustomer': { en: 'Find by name / phone / email', hy: 'Որոնել՝ անուն / հեռախոս / էլ. հասցե', ru: 'Поиск по имени / телефону / email' },
  's.addCustomer': { en: '+ Add new customer', hy: '+ Ավելացնել նոր հաճախորդ', ru: '+ Добавить нового клиента' },
  's.fullName': { en: 'Full name', hy: 'Անուն ազգանուն', ru: 'Полное имя' },
  's.phone': { en: 'Phone', hy: 'Հեռախոս', ru: 'Телефон' },
  's.walkIn': {
    en: 'Or proceed as walk-in (no customer).',
    hy: 'Կամ շարունակեք առանց հաճախորդի։',
    ru: 'Или продолжайте без клиента.',
  },
  's.confirmSell': { en: 'Confirm & Sell', hy: 'Հաստատել և վաճառել', ru: 'Подтвердить и продать' },
  's.saleFailed': { en: 'Sale could not be saved', hy: 'Վաճառքը չհաջողվեց պահպանել', ru: 'Не удалось сохранить продажу' },
  's.stockHere': { en: 'Stock here', hy: 'Մնացորդն այստեղ', ru: 'Остаток здесь' },

  // Receive
  'r.title': { en: 'Receive stock', hy: 'Ապրանքի ընդունում', ru: 'Приём товара' },
  'r.subtitle': { en: "Add newly arrived items to a selling point's inventory.", hy: 'Ավելացրեք նոր ստացված ապրանքները վաճառակետի պահեստ։', ru: 'Добавьте поступившие товары на склад точки продаж.' },
  'r.addVariant': { en: '+ Add variant', hy: '+ Ավելացնել տարբերակ', ru: '+ Добавить вариант' },
  'r.itemsToReceive': { en: 'Items to receive', hy: 'Ընդունվող ապրանքներ', ru: 'Товары к приёму' },
  'r.checkInN': { en: 'Check in', hy: 'Ընդունել', ru: 'Принять' },
  'r.recent': { en: 'Recent check-ins', hy: 'Վերջին ընդունումները', ru: 'Последние приёмы' },
  'r.noneYet': { en: 'None yet.', hy: 'Դեռ ոչինչ չկա։', ru: 'Пока ничего нет.' },

  // Kacca
  'k.title': { en: 'Kacca — cash drawer', hy: 'Դրամարկղ', ru: 'Касса' },
  'k.startShift': { en: 'Start a shift', hy: 'Սկսել հերթափոխ', ru: 'Открыть смену' },
  'k.pickPoint': { en: 'Pick one…', hy: 'Ընտրեք…', ru: 'Выберите…' },
  'k.countDrawer': { en: 'Opening count (count the drawer)', hy: 'Բացման մնացորդ (հաշվեք դրամարկղը)', ru: 'Открывающий остаток (пересчитайте кассу)' },
  'k.startBtn': { en: 'Start shift', hy: 'Բացել հերթափոխ', ru: 'Открыть смену' },
  'k.handoverHint': {
    en: 'If your count differs from what the previous person left, both numbers are saved and admin is notified.',
    hy: 'Եթե ձեր հաշիվը տարբերվում է նախորդ աշխատողի թողածից, երկու թվերն էլ պահպանվում են, և ադմինը ծանուցվում է։',
    ru: 'Если ваш подсчёт отличается от того, что оставил предыдущий сотрудник, оба числа сохраняются, и админ получает уведомление.',
  },
  'k.shiftOpen': { en: 'Your shift is open', hy: 'Ձեր հերթափոխը բաց է', ru: 'Ваша смена открыта' },
  'k.opened': { en: 'opened', hy: 'բացված', ru: 'открыта' },
  'k.closingCount': { en: 'Closing count (count the drawer)', hy: 'Փակման մնացորդ (հաշվեք դրամարկղը)', ru: 'Закрывающий остаток (пересчитайте кассу)' },
  'k.endShift': { en: 'End shift & hand over', hy: 'Փակել հերթափոխը և հանձնել', ru: 'Закрыть смену и сдать' },
  'k.recentSessions': { en: 'Recent sessions', hy: 'Վերջին հերթափոխները', ru: 'Последние смены' },
  'k.allReports': { en: 'All session reports →', hy: 'Բոլոր հերթափոխների հաշվետվությունները →', ru: 'Все отчёты по сменам →' },
  'k.alreadyOpen': { en: 'A shift is already open at this selling point by', hy: 'Այս վաճառակետում արդեն բաց է հերթափոխ՝', ru: 'На этой точке уже открыта смена пользователем' },
  'k.mustClose': { en: 'They must close it first.', hy: 'Նրանք նախ պետք է փակեն այն։', ru: 'Сначала её нужно закрыть.' },

  // Orders
  'o.title': { en: 'Orders', hy: 'Պատվերներ', ru: 'Заказы' },
  'o.new': { en: '+ New order', hy: '+ Նոր պատվեր', ru: '+ Новый заказ' },
  'o.customerName': { en: 'Customer name', hy: 'Հաճախորդի անուն', ru: 'Имя клиента' },
  'o.address': { en: 'Address', hy: 'Հասցե', ru: 'Адрес' },
  'o.deadline': { en: 'Deadline', hy: 'Վերջնաժամկետ', ru: 'Срок' },
  'o.channel': { en: 'Channel', hy: 'Կանալ', ru: 'Канал' },
  'o.online': { en: 'Online', hy: 'Առցանց', ru: 'Онлайн' },
  'o.salesPoint': { en: 'Sales point', hy: 'Վաճառակետ', ru: 'Точка продаж' },
  'o.itemsAndCosts': { en: 'Items & cost details', hy: 'Ապրանքներ և արժեք', ru: 'Товары и стоимость' },
  'o.addCatalog': { en: '+ Add catalog item', hy: '+ Ավելացնել կատալոգից', ru: '+ Добавить из каталога' },
  'o.addCustom': { en: '+ Add custom item', hy: '+ Ավելացնել պատվերով', ru: '+ Добавить под заказ' },
  'o.customDesc': { en: 'Custom item description', hy: 'Պատվերով ապրանքի նկարագրություն', ru: 'Описание индивидуального товара' },
  'o.unitPrice': { en: 'Unit price (AMD)', hy: 'Միավորի գին (֏)', ru: 'Цена за единицу (֏)' },
  'o.metalType': { en: 'Metal type', hy: 'Մետաղի տեսակ', ru: 'Тип металла' },
  'o.metalCost': { en: 'Metal cost (AMD)', hy: 'Մետաղի արժեք (֏)', ru: 'Стоимость металла (֏)' },
  'o.filling': { en: 'Filling material', hy: 'Լցանյութ', ru: 'Наполнитель' },
  'o.fillingCost': { en: 'Filling cost (AMD)', hy: 'Լցանյութի արժեք (֏)', ru: 'Стоимость наполнителя (֏)' },
  'o.plating': { en: 'Plating type', hy: 'Ծածկույթի տեսակ', ru: 'Тип покрытия' },
  'o.platingCost': { en: 'Plating cost (AMD)', hy: 'Ծածկույթի արժեք (֏)', ru: 'Стоимость покрытия (֏)' },
  'o.laborCost': { en: 'Labor cost (AMD)', hy: 'Աշխատանքի արժեք (֏)', ru: 'Стоимость работы (֏)' },
  'o.lineCost': { en: 'Line cost', hy: 'Տողի արժեք', ru: 'Стоимость строки' },
  'o.createOrder': { en: 'Create order', hy: 'Ստեղծել պատվեր', ru: 'Создать заказ' },
  'o.noOrders': { en: 'No orders yet.', hy: 'Դեռևս պատվերներ չկան։', ru: 'Заказов пока нет.' },
  'o.deadlineLabel': { en: 'Deadline:', hy: 'Վերջնաժամկետ՝', ru: 'Срок:' },
  'o.by': { en: 'By', hy: 'Կողմից', ru: 'От' },

  // Customers
  'cu.title': { en: 'Customers', hy: 'Հաճախորդներ', ru: 'Клиенты' },
  'cu.noCustomers': { en: 'No customers.', hy: 'Հաճախորդներ չկան։', ru: 'Клиентов нет.' },

  // Notifications
  'n.title': { en: 'Notifications', hy: 'Ծանուցումներ', ru: 'Уведомления' },
  'n.unread': { en: 'unread', hy: 'չկարդացված', ru: 'непрочитано' },
  'n.allRead': { en: 'All caught up.', hy: 'Ամեն ինչ կարդացված է։', ru: 'Всё прочитано.' },
  'n.markAllRead': { en: 'Mark all read', hy: 'Նշել բոլորը կարդացված', ru: 'Отметить всё прочитанным' },
  'n.empty': {
    en: 'No notifications yet. Low-stock and new-order alerts will appear here.',
    hy: 'Ծանուցումներ դեռ չկան։ Քիչ մնացորդի և նոր պատվերի ծանուցումները կհայտնվեն այստեղ։',
    ru: 'Уведомлений пока нет. Здесь появятся оповещения о низком остатке и новых заказах.',
  },
  'n.lowStock': { en: 'Low stock', hy: 'Քիչ մնացորդ', ru: 'Низкий остаток' },
  'n.newOrder': { en: 'New order', hy: 'Նոր պատվեր', ru: 'Новый заказ' },
  'n.kacca': { en: 'Kacca discrepancy', hy: 'Դրամարկղի անհամապատասխանություն', ru: 'Расхождение в кассе' },
  'n.invite': { en: 'Invite', hy: 'Հրավեր', ru: 'Приглашение' },
  'n.new': { en: 'New', hy: 'Նոր', ru: 'Новое' },

  // Browse
  'b.title': { en: 'Browse the catalog', hy: 'Կատալոգի դիտում', ru: 'Просмотр каталога' },
  'b.pickCollection': { en: 'Pick a collection', hy: 'Ընտրեք հավաքածու', ru: 'Выберите коллекцию' },
  'b.searchFilter': { en: 'Search & filter →', hy: 'Որոնում և զտում →', ru: 'Поиск и фильтры →' },
  'b.pickCategory': { en: 'Pick a category', hy: 'Ընտրեք կատեգորիա', ru: 'Выберите категорию' },
  'b.allCollections': { en: '← All collections', hy: '← Բոլոր հավաքածուները', ru: '← Все коллекции' },
  'b.groupedBySize': { en: 'grouped by size', hy: 'խմբավորված ըստ չափսի', ru: 'сгруппировано по размеру' },
  'b.oneSize': { en: 'One size', hy: 'Մեկ չափս', ru: 'Один размер' },
  'b.noCollections': { en: 'No collections yet.', hy: 'Հավաքածուներ դեռ չկան։', ru: 'Коллекций пока нет.' },
  'b.noCategories': { en: 'No categories in this collection.', hy: 'Այս հավաքածուում կատեգորիաներ չկան։', ru: 'В этой коллекции нет категорий.' },
};

export function t(key: string, locale: Locale): string {
  return D[key]?.[locale] ?? D[key]?.[DEFAULT_LOCALE] ?? key;
}

export type Dict = Record<string, string>;

/** Whole dict for a locale — passed to the client context. */
export function dictFor(locale: Locale): Dict {
  const out: Dict = {};
  for (const k in D) out[k] = D[k][locale] ?? D[k][DEFAULT_LOCALE];
  return out;
}

