let serverStartTime;

// Variable para almacenar los pedidos nuevos
let newOrders = [];

// Function to update the server uptime display
function updateUptime() {
    if (!serverStartTime) return;
    
    const now = new Date();
    const diffMs = now - serverStartTime;

    const seconds = Math.floor((diffMs / 1000) % 60);
    const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
    const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    document.getElementById('uptime').textContent =
        `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

// Simple client-side view router: 'dashboard' or 'stats'
function showView(view) {
    const dashboard = document.getElementById('main-dashboard');
    const stats = document.getElementById('stats-page');
    if (!dashboard || !stats) return;
    if (view === 'stats') {
        dashboard.style.display = 'none';
        stats.style.display = 'block';
        // When opening stats page, render content
        renderFullStatistics();
    } else {
        stats.style.display = 'none';
        dashboard.style.display = 'block';
    }
}

// Function to fetch server status and update the dashboard
async function fetchServerStatus() {
    try {
        const response = await fetch('/api/server-status');
        const data = await response.json();
        
        // Update server start time if not already set
        if (!serverStartTime) {
            serverStartTime = new Date(data.startTime);
            document.getElementById('start-time').textContent = 
                new Date(data.startTime).toLocaleString('es-ES', { 
                    timeZone: 'America/Havana' 
                });
        }

        // Update logs
        const logOutput = document.getElementById('log-output');
        logOutput.innerHTML = ''; // Clear previous logs
        data.logs.forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.classList.add('log-entry');
            logEntry.textContent = log;
            logOutput.appendChild(logEntry);
        });
        logOutput.scrollTop = logOutput.scrollHeight; // Auto-scroll to bottom
    } catch (error) {
        console.error('Error fetching server status:', error);
    }
}

// Helpers: debounce and loader
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function showStatsLoader(show = true) {
    const loader = document.getElementById('stats-loader');
    if (!loader) return;
    loader.style.display = show ? 'block' : 'none';
    loader.setAttribute('aria-hidden', (!show).toString());
}

// Rellenar el filtro de países con valores únicos
function populateCountryFilter(stats) {
    const sel = document.getElementById('stats-country-filter');
    if (!sel || !Array.isArray(stats)) return;
    // Obtener países únicos
    const countries = Array.from(new Set(stats.map(s => s.pais || '').filter(Boolean))).sort();
    // Guardar la selección actual
    const current = sel.value || '';
    sel.innerHTML = '<option value="">Todos los países</option>';
    countries.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        sel.appendChild(opt);
    });
    if (current) sel.value = current;
}

// Function to fetch and update statistics
async function updateStatistics() {
    try {
        const response = await fetch('/obtener-estadisticas');
        const stats = await response.json();

        document.getElementById('total-requests').textContent = stats.length;

        if (stats.length > 0) {
            const lastStat = stats[stats.length - 1];
            document.getElementById('last-request').textContent =
                `${lastStat.fecha_hora_entrada} desde ${lastStat.pais} (${lastStat.ip})`;

            const uniqueIPs = new Set(stats.map(s => s.ip));
            document.getElementById('unique-users').textContent = uniqueIPs.size;

            const recurringUsers = stats.filter(s => s.tipo_usuario === 'Recurrente').length;
            document.getElementById('recurring-users').textContent = recurringUsers;
        } else {
            document.getElementById('last-request').textContent = 'N/A';
            document.getElementById('unique-users').textContent = '0';
            document.getElementById('recurring-users').textContent = '0';
        }
    } catch (error) {
        console.error('Error fetching statistics:', error);
        document.getElementById('total-requests').textContent = 'Error';
        document.getElementById('last-request').textContent = 'Error';
        document.getElementById('unique-users').textContent = 'Error';
        document.getElementById('recurring-users').textContent = 'Error';
    }
}

// Renderizar una vista visual de las estadísticas completas
async function renderFullStatistics() {
    try {
        showStatsLoader(true);
        const response = await fetch('/obtener-estadisticas');
        const stats = await response.json();

        const list = document.getElementById('stats-list');
        list.innerHTML = '';

        if (!stats || stats.length === 0) {
            list.innerHTML = '<p style="padding:1rem">No hay estadísticas registradas.</p>';
            showStatsLoader(false);
            return;
        }

        // Populate country filter
        populateCountryFilter(stats);

        // Aplicar búsqueda y filtros
        const searchVal = (document.getElementById('stats-search')?.value || '').toLowerCase();
        const countryFilter = (document.getElementById('stats-country-filter')?.value || '');
        const sortMode = (document.getElementById('stats-sort')?.value || 'date_desc');

        let filtered = stats.slice();

        if (searchVal) {
            filtered = filtered.filter(s => (
                (s.ip || '').toString().toLowerCase().includes(searchVal) ||
                (s.pais || '').toString().toLowerCase().includes(searchVal) ||
                (s.afiliado || '').toString().toLowerCase().includes(searchVal)
            ));
        }

        if (countryFilter) {
            filtered = filtered.filter(s => (s.pais || '') === countryFilter);
        }

        // Ordenar por fecha
        filtered.sort((a, b) => {
            const da = new Date(a.fecha_hora_entrada || 0).getTime();
            const db = new Date(b.fecha_hora_entrada || 0).getTime();
            return sortMode === 'date_asc' ? da - db : db - da;
        });

        // Paginación simple: 20 por página
        const perPage = 20;
        const page = parseInt(document.getElementById('stats-pagination')?.getAttribute('data-page') || '1', 10) || 1;
        const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
        const pageItems = filtered.slice((page - 1) * perPage, page * perPage);

        // Actualizar paginador
        renderPagination(page, totalPages);

        // Mostrar las entradas de la página actual
        pageItems.forEach((s, idx) => {
            const card = document.createElement('div');
            card.className = 'stat-card';

            const header = document.createElement('div');
            header.className = 'stat-card-header';
            header.innerHTML = `<strong>${s.pais || 'Desconocido'}</strong> <span class="small">${s.fecha_hora_entrada || ''}</span>`;

            const body = document.createElement('div');
            body.className = 'stat-card-body';
            body.innerHTML = `
                <p><strong>IP:</strong> ${s.ip || 'N/A'}</p>
                <p><strong>Origen:</strong> ${s.origen || 'N/A'}</p>
                <p><strong>Afiliado:</strong> ${s.afiliado || 'Ninguno'}</p>
                <p><strong>Tipo:</strong> ${s.tipo_usuario || 'N/A'}</p>
                <p><strong>Tiempo en página (s):</strong> ${s.tiempo_promedio_pagina || s.duracion_sesion_segundos || 0}</p>
                <p><strong>Navegador / SO:</strong> ${s.navegador || 'Desconocido'} / ${s.sistema_operativo || 'Desconocido'}</p>
            `;

            card.appendChild(header);
            card.appendChild(body);

            // Mostrar resumen de compras si existen
            if (Array.isArray(s.compras) && s.compras.length > 0) {
                const purchases = document.createElement('div');
                purchases.className = 'stat-purchases';
                purchases.innerHTML = '<strong>Compras:</strong>';
                const ul = document.createElement('ul');
                s.compras.forEach(c => {
                    const li = document.createElement('li');
                    // Intentar mostrar nombre, cantidad y precio si existen
                    const name = c.nombre || c.producto || c.title || 'Producto';
                    const qty = c.cantidad || c.quantity || 1;
                    const price = c.precio || c.price || s.precio_compra_total || 0;
                    li.textContent = `${name} — Cant: ${qty} — Precio: ${price}`;
                    ul.appendChild(li);
                });
                purchases.appendChild(ul);
                card.appendChild(purchases);
            }

            list.appendChild(card);
        });

        showStatsLoader(false);
    } catch (err) {
        console.error('Error al renderizar estadísticas completas:', err);
        alert('Error al obtener o procesar las estadísticas. Revisa la consola.');
        showStatsLoader(false);
    }
}

function renderPagination(currentPage, totalPages) {
    const container = document.getElementById('stats-pagination');
    if (!container) return;
    container.setAttribute('data-page', currentPage);
    container.innerHTML = '';
    const info = document.createElement('div');
    info.className = 'pagination-info';
    info.textContent = `Página ${currentPage} de ${totalPages}`;
    container.appendChild(info);

    const controls = document.createElement('div');
    controls.className = 'pagination-controls';

    const prev = document.createElement('button');
    prev.className = 'btn';
    prev.textContent = 'Anterior';
    prev.disabled = currentPage <= 1;
    prev.addEventListener('click', () => { container.setAttribute('data-page', Math.max(1, currentPage - 1)); renderFullStatistics(); });

    const next = document.createElement('button');
    next.className = 'btn';
    next.textContent = 'Siguiente';
    next.disabled = currentPage >= totalPages;
    next.addEventListener('click', () => { container.setAttribute('data-page', Math.min(totalPages, currentPage + 1)); renderFullStatistics(); });

    controls.appendChild(prev);
    controls.appendChild(next);
    container.appendChild(controls);
}

// Function to clear the console (client-side only)
function clearConsole() {
    document.getElementById('log-output').innerHTML = '';
}

// Function to copy logs to clipboard
function copyLogsToClipboard() {
    const logOutput = document.getElementById('log-output');
    const logsText = logOutput.innerText;
    
    navigator.clipboard.writeText(logsText)
        .then(() => alert('Logs copiados al portapapeles!'))
        .catch(err => {
            console.error('Error al copiar los logs:', err);
            alert('Error al copiar los logs. Por favor, inténtalo de nuevo.');
        });
}

// Function to clear statistics with better error handling (legacy with browser confirm)
async function clearStatistics() {
    if (!confirm('¿Estás seguro de que deseas eliminar todas las estadísticas?\nEsta acción no se puede deshacer.')) {
        return;
    }
    return performClearStatistics();
}

// Perform the actual clear operation without prompting (used by modal)
async function performClearStatistics() {
    try {
        const response = await fetch('/api/clear-statistics', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Update UI without alert (use notifications)
            await updateStatistics();
            await fetchServerStatus();
            return true;
        } else {
            throw new Error(data.error || 'Error desconocido al limpiar las estadísticas');
        }
    } catch (error) {
        console.error('Error al limpiar estadísticas:', error);
        throw error;
    }
}

// Función para obtener datos remotos desde GitHub con caché
async function fetchRemoteData() {
    const remoteUrl = "https://raw.githubusercontent.com/HCoreBeat/Analytics-Montaque/main/data/estadistica.json";

    try {
        loading.show('main-dashboard');
        const remoteData = await api.fetchCached(remoteUrl, {}, 300000); // 5 minutos de caché
        return remoteData;
    } catch (error) {
        console.error("Error al obtener datos remotos:", error);
        notifications.error("No se pudieron obtener los datos remotos. Verificando conexión...");
        return [];
    } finally {
        loading.hide('main-dashboard');
    }
}

// Función para comparar datos locales con remotos y filtrar pedidos nuevos
async function findNewOrders() {
    try {
        // Obtener datos locales
        const response = await fetch('/obtener-estadisticas');
        const localData = await response.json();

        // Obtener datos remotos
        const remoteData = await fetchRemoteData();

        // Filtrar pedidos nuevos
        newOrders = localData.filter(localItem => {
            // Verificar que el registro local tiene compras
            const isOrder = Array.isArray(localItem.compras) && localItem.compras.length > 0;

            if (!isOrder) {
                return false; // No es un pedido, ignorar
            }

            // Verificar si el pedido ya existe en los datos remotos
            return !remoteData.some(remoteItem => {
                return (
                    Array.isArray(remoteItem.compras) && remoteItem.compras.length > 0 &&
                    remoteItem.ip === localItem.ip &&
                    remoteItem.fecha_hora_entrada === localItem.fecha_hora_entrada
                );
            });
        });

        console.log("Pedidos nuevos:", newOrders);
        updateNewOrdersCount();

    } catch (error) {
        console.error("Error al comparar datos locales y remotos:", error);
        alert("Ocurrió un error al comparar los datos locales y remotos.");
    }
}

// Function to show the number of new orders
function updateNewOrdersCount() {
    const countElement = document.getElementById('new-orders-count');
    countElement.textContent = newOrders.length;
    const button = document.getElementById('new-orders-button');
    button.style.display = newOrders.length > 0 ? 'block' : 'none';
}

// Función para mostrar los pedidos nuevos en el panel
function showNewOrdersPanel() {
    const panel = document.getElementById('new-orders-panel');
    const ordersList = document.getElementById('orders-list');

    // Limpiar contenido previo
    ordersList.textContent = '';

    // Agregar cada pedido en formato JSON con un botón para copiar
    newOrders.forEach((order, index) => {
        const orderContainer = document.createElement('div');
        orderContainer.style.marginBottom = '15px';
        orderContainer.style.padding = '15px';
        orderContainer.style.border = '1px solid #ddd';
        orderContainer.style.borderRadius = '5px';
        orderContainer.style.background = '#fff';
        orderContainer.style.overflow = 'auto';
        orderContainer.style.maxHeight = '200px';

        const orderJson = JSON.stringify(order, null, 2);

        const orderText = document.createElement('pre');
        orderText.textContent = orderJson;
        orderText.style.whiteSpace = 'pre-wrap';
        orderText.style.wordBreak = 'break-word';
        orderText.style.margin = '0';
        orderText.style.fontSize = '14px';
        orderText.style.lineHeight = '1.5';
        orderText.style.color = '#333';
        orderText.style.background = '#f4f4f4';
        orderText.style.padding = '10px';
        orderText.style.borderRadius = '5px';

        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copiar JSON';
        copyButton.style.marginTop = '10px';
        copyButton.style.background = '#007bff';
        copyButton.style.color = 'white';
        copyButton.style.border = 'none';
        copyButton.style.borderRadius = '5px';
        copyButton.style.padding = '5px 10px';
        copyButton.style.cursor = 'pointer';

        copyButton.addEventListener('click', () => {
            navigator.clipboard.writeText(orderJson).then(() => {
                alert(`Pedido ${index + 1} copiado al portapapeles.`);
            }).catch(err => {
                console.error('Error al copiar el JSON:', err);
                alert('Error al copiar el JSON. Por favor, intenta de nuevo.');
            });
        });

        orderContainer.appendChild(orderText);
        orderContainer.appendChild(copyButton);
        ordersList.appendChild(orderContainer);
    });

    panel.style.display = 'block';
}

// Función para cerrar el panel
function closeNewOrdersPanel() {
    const panel = document.getElementById('new-orders-panel');
    panel.style.display = 'none';
}

// Initialize dashboard with optimized updates
function initDashboard() {
    let updateFailCount = 0;
    const MAX_FAILS = 3;

    // Update uptime every second
    setInterval(updateUptime, 1000);

    // Update server status and statistics every 60 seconds
    const updateInterval = setInterval(async () => {
        try {
            loading.show('main-dashboard');
            await Promise.all([
                fetchServerStatus(),
                updateStatistics()
            ]);
            updateFailCount = 0; // Reset fail counter on success
        } catch (error) {
            console.error('Error updating dashboard:', error);
            updateFailCount++;
            
            if (updateFailCount >= MAX_FAILS) {
                notifications.error('Múltiples errores de actualización. Verificando conexión...');
                // Intentar reconectar después de un tiempo
                setTimeout(async () => {
                    try {
                        await fetchServerStatus();
                        await updateStatistics();
                        updateFailCount = 0;
                        notifications.success('Conexión restablecida');
                    } catch (e) {
                        notifications.error('No se pudo restablecer la conexión');
                    }
                }, 5000);
            }
        } finally {
            loading.hide('main-dashboard');
        }
    }, 60000); // Aumentado a 60 segundos

    // Initial update with loading indicator
    (async () => {
        try {
            loading.show('main-dashboard');
            await Promise.all([
                fetchServerStatus(),
                updateStatistics()
            ]);
            notifications.success('Datos iniciales cargados correctamente');
        } catch (error) {
            console.error('Error en la carga inicial:', error);
            notifications.error('Error al cargar los datos iniciales');
        } finally {
            loading.hide('main-dashboard');
        }
    })();
    
        // Botones para la vista visual de estadísticas
        const viewStatsBtn = document.getElementById('view-stats-button');
        const closeFullStatsBtn = document.getElementById('close-full-stats');

        if (viewStatsBtn) {
            viewStatsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                showView('stats');
            });
        }

        if (closeFullStatsBtn) {
            closeFullStatsBtn.addEventListener('click', () => {
                showView('dashboard');
            });
        }
}

// Notification system
const notifications = {
    show(message, type = 'info', duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.setAttribute('role', 'alert');
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        const panel = document.getElementById('notification-panel');
        panel.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 500);
        }, duration);
    },
    success(message) { this.show(message, 'success'); },
    error(message) { this.show(message, 'error'); },
    info(message) { this.show(message, 'info'); }
};

// API calls with retry mechanism
const api = {
    async fetch(url, options = {}, retries = 3) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.fetch(url, options, retries - 1);
            }
            throw error;
        }
    },
    
    // Cache system
    cache: new Map(),
    async fetchCached(url, options = {}, ttl = 60000) {
        const cacheKey = url + JSON.stringify(options);
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < ttl) {
            return cached.data;
        }
        
        const data = await this.fetch(url, options);
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
    }
};

// Loading indicator
const loading = {
    show(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.add('loading');
            element.setAttribute('aria-busy', 'true');
        }
    },
    hide(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.remove('loading');
            element.setAttribute('aria-busy', 'false');
        }
    }
};

// Keyboard shortcuts
const shortcuts = {
    init() {
        document.addEventListener('keydown', (e) => {
            // ESC para cerrar paneles
            if (e.key === 'Escape') {
                closeNewOrdersPanel();
            }
            // CTRL + K para buscar
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                document.getElementById('stats-search')?.focus();
            }
        });
    }
};

// Start dashboard when page loads
window.addEventListener('load', () => {
    initDashboard();
    shortcuts.init();
    notifications.info('Panel inicializado correctamente');
});

// Event listeners initialization
document.addEventListener('DOMContentLoaded', () => {
    const newOrdersButton = document.getElementById('new-orders-button');
    const closeOrdersPanel = document.getElementById('close-orders-panel');

    if (newOrdersButton) {
        newOrdersButton.addEventListener('click', () => {
            loading.show('new-orders-panel');
            showNewOrdersPanel().catch(error => {
                notifications.error('Error al mostrar los pedidos nuevos');
                console.error(error);
            }).finally(() => {
                loading.hide('new-orders-panel');
            });
        });
    }

    if (closeOrdersPanel) {
        closeOrdersPanel.addEventListener('click', closeNewOrdersPanel);
    } else {
        console.error('Elemento con ID "close-orders-panel" no encontrado.');
    }

    // Asociar el botón de actualización con la función updateData
    const updateButton = document.getElementById('update-comparison-button');
    if (updateButton) {
        updateButton.addEventListener('click', updateData);
    }

    // Estadísticas: bind search/filter/sort with debounce
    const statsSearch = document.getElementById('stats-search');
    const statsCountry = document.getElementById('stats-country-filter');
    const statsSort = document.getElementById('stats-sort');
    const statsBack = document.getElementById('stats-back');

    const debouncedRender = debounce(() => renderFullStatistics(), 250);

    if (statsSearch) {
        statsSearch.addEventListener('input', debouncedRender);
    }
    if (statsCountry) {
        statsCountry.addEventListener('change', () => {
            // reset to page 1 when changing filter
            const paginator = document.getElementById('stats-pagination');
            if (paginator) paginator.setAttribute('data-page', '1');
            renderFullStatistics();
        });
    }
    if (statsSort) {
        statsSort.addEventListener('change', () => {
            const paginator = document.getElementById('stats-pagination');
            if (paginator) paginator.setAttribute('data-page', '1');
            renderFullStatistics();
        });
    }
    if (statsBack) {
        statsBack.addEventListener('click', (e) => { e.preventDefault(); showView('dashboard'); });
    }

    // Settings dropdown and modal actions
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsMenu = document.getElementById('settings-menu');
    const settingsDropdown = document.getElementById('settings-dropdown');

    const modalOverlay = document.getElementById('modal-overlay');
    const modalMessage = document.getElementById('modal-message');
    const modalInput = document.getElementById('modal-confirm-input');
    const modalConfirmBtn = document.getElementById('modal-confirm-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');

    function closeSettingsMenu() {
        if (settingsMenu) {
            settingsMenu.style.display = 'none';
            settingsMenu.setAttribute('aria-hidden', 'true');
        }
    }

    function openSettingsMenu() {
        if (settingsMenu) {
            settingsMenu.style.display = 'block';
            settingsMenu.setAttribute('aria-hidden', 'false');
        }
    }

    if (settingsToggle) {
        settingsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (settingsMenu && settingsMenu.style.display === 'block') closeSettingsMenu(); else openSettingsMenu();
        });
    }

    // close settings when clicking outside
    document.addEventListener('click', (e) => {
        if (!settingsDropdown) return;
        if (!settingsDropdown.contains(e.target)) closeSettingsMenu();
    });

    // Action: Clear statistics (opens modal)
    const actionClearBtn = document.getElementById('action-clear-statistics');
    if (actionClearBtn) {
        actionClearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // Open modal
            if (modalOverlay) modalOverlay.style.display = 'flex';
            if (modalMessage) modalMessage.textContent = '¿Estás seguro de que deseas eliminar todas las estadísticas? Esta acción no se puede deshacer.';
            if (modalInput) { modalInput.value = ''; modalInput.focus(); }
            if (modalConfirmBtn) modalConfirmBtn.disabled = true;
            closeSettingsMenu();
        });
    }

    // Action: export CSV
    const actionExportBtn = document.getElementById('action-export-csv');
    if (actionExportBtn) {
        actionExportBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            closeSettingsMenu();
            try {
                await exportFilteredCSV();
                showNotificationPanel('CSV exportado correctamente.', 'success');
            } catch (err) {
                console.error('Error exportando CSV:', err);
                showNotificationPanel('Error exportando CSV.', 'error');
            }
        });
    }

    // Export filtered CSV implementation
    async function exportFilteredCSV() {
        const response = await fetch('/obtener-estadisticas');
        const stats = await response.json();

        // Apply same filters as renderFullStatistics
        const searchVal = (document.getElementById('stats-search')?.value || '').toLowerCase();
        const countryFilter = (document.getElementById('stats-country-filter')?.value || '');
        const sortMode = (document.getElementById('stats-sort')?.value || 'date_desc');

        let filtered = Array.isArray(stats) ? stats.slice() : [];

        if (searchVal) {
            filtered = filtered.filter(s => (
                (s.ip || '').toString().toLowerCase().includes(searchVal) ||
                (s.pais || '').toString().toLowerCase().includes(searchVal) ||
                (s.afiliado || '').toString().toLowerCase().includes(searchVal)
            ));
        }

        if (countryFilter) {
            filtered = filtered.filter(s => (s.pais || '') === countryFilter);
        }

        filtered.sort((a, b) => {
            const da = new Date(a.fecha_hora_entrada || 0).getTime();
            const db = new Date(b.fecha_hora_entrada || 0).getTime();
            return sortMode === 'date_asc' ? da - db : db - da;
        });

        // Build CSV rows
        const headers = ['fecha_hora_entrada','ip','pais','origen','afiliado','tipo_usuario','precio_compra_total','compras'];
        const rows = [headers.join(',')];
        filtered.forEach(r => {
            const compras = JSON.stringify(r.compras || []);
            const row = [
                `"${(r.fecha_hora_entrada||'').toString().replace(/"/g,'""')}"`,
                `"${(r.ip||'').toString().replace(/"/g,'""')}"`,
                `"${(r.pais||'').toString().replace(/"/g,'""')}"`,
                `"${(r.origen||'').toString().replace(/"/g,'""')}"`,
                `"${(r.afiliado||'').toString().replace(/"/g,'""')}"`,
                `"${(r.tipo_usuario||'').toString().replace(/"/g,'""')}"`,
                `"${(r.precio_compra_total||0).toString().replace(/"/g,'""')}"`,
                `"${compras.replace(/"/g,'""')}"`
            ];
            rows.push(row.join(','));
        });

        const csvContent = rows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `estadisticas_export_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    if (modalInput) {
        modalInput.addEventListener('input', (e) => {
            const v = (e.target.value || '').trim().toUpperCase();
            if (modalConfirmBtn) modalConfirmBtn.disabled = (v !== 'BORRAR');
        });
    }

    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', (e) => {
            if (modalOverlay) modalOverlay.style.display = 'none';
        });
    }

    if (modalConfirmBtn) {
        modalConfirmBtn.addEventListener('click', async (e) => {
            // Perform clear using backend API (no browser confirm here)
            if (modalOverlay) modalOverlay.style.display = 'none';
            try {
                await performClearStatistics();
                showNotificationPanel('Estadísticas eliminadas.', 'success');
            } catch (err) {
                console.error('Error al limpiar estadísticas:', err);
                showNotificationPanel('Error al limpiar estadísticas.', 'error');
            }
        });
    }
});

// Call the function to find new orders when the page loads
window.onload = () => {
    findNewOrders();
};

// Verificar nuevos pedidos al cargar la página
window.addEventListener('DOMContentLoaded', async () => {
    try {
        // Hacer una solicitud a la API para actualizar la comparación
        const response = await fetch('/api/update-comparison', { method: 'POST' });
        const data = await response.json();

        if (data.success && data.newOrders.length > 0) {
            console.log(`Se encontraron ${data.newOrders.length} nuevos pedidos.`);

            // Mostrar el botón new-orders-button
            const newOrdersButton = document.getElementById('new-orders-button');
            if (newOrdersButton) {
                newOrdersButton.style.display = 'block';
            }
        } else {
            console.log('No se encontraron nuevos pedidos.');
        }
    } catch (error) {
        console.error('Error al verificar nuevos pedidos:', error);
    }
});

function clearOrdersPanel() {
    const panel = document.getElementById('new-orders-panel');
    const ordersList = document.getElementById('orders-list');

    // Limpiar contenido del panel
    ordersList.textContent = '';

    // Ocultar el panel si está activo
    if (panel.classList.contains('active')) {
        panel.classList.remove('active');
    }
}

// Mostrar notificación en la parte superior de la pantalla
function showNotification(message, type = 'info') {
    const notificationPanel = document.getElementById('notification-panel');
    if (!notificationPanel) {
        console.error('No se encontró el elemento #notification-panel');
        return;
    }

    const notification = document.createElement('div');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notificationPanel.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 10000); // Mantener duración de 10 segundos
}

function showNotificationPanel(message, type = 'info') {
    const notificationPanel = document.getElementById('notification-panel');
    const notificationMessage = document.createElement('div');
    notificationMessage.textContent = message;
    notificationMessage.className = `notification ${type}`;
    notificationPanel.appendChild(notificationMessage);

    setTimeout(() => {
        notificationMessage.remove();
    }, 5000);
}

// Llamar a esta función después de limpiar estadísticas
async function handleClearStatistics() {
    try {
        const response = await fetch('/api/clear-statistics', { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            showNotificationPanel('Estadísticas limpiadas correctamente.', 'success');

            // Vaciar la lista de pedidos nuevos
            newOrders = [];

            // Limpiar el contenido del panel de pedidos
            const ordersList = document.getElementById('orders-list');
            ordersList.textContent = '';

            // Ocultar el botón de pedidos
            const newOrdersButton = document.getElementById('new-orders-button');
            newOrdersButton.classList.add('hidden');

            // Ocultar el panel si está activo
            const panel = document.getElementById('new-orders-panel');
            if (panel.classList.contains('active')) {
                panel.classList.remove('active');
            }

            // Mostrar notificación de comparación
            if (result.newOrders.length > 0) {
                showNotificationPanel(`Se encontraron ${result.newOrders.length} nuevos pedidos.`, 'info');
            } else {
                showNotificationPanel('No hay nuevos pedidos.', 'info');
            }
        } else {
            throw new Error(result.error || 'Error desconocido al limpiar estadísticas.');
        }
    } catch (error) {
        console.error('Error al limpiar estadísticas:', error);
        showNotificationPanel('Error al limpiar estadísticas. Por favor, intenta de nuevo.', 'error');
    }
}

async function handleUpdateComparison() {
    try {
        const response = await fetch('/api/update-comparison', { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            newOrders = result.newOrders;
            updateNewOrdersCount();

            if (newOrders.length > 0) {
                showNotificationPanel(`Se encontraron ${newOrders.length} nuevos pedidos.`, 'info');
            } else {
                showNotificationPanel('No hay nuevos pedidos.', 'info');
            }
        } else {
            throw new Error(result.error || 'Error desconocido al actualizar comparación.');
        }
    } catch (error) {
        console.error('Error al actualizar comparación:', error);
        showNotificationPanel('Error al actualizar comparación. Por favor, intenta de nuevo.', 'error');
    }
}

// Mostrar notificación al actualizar
async function updateData() {
    showNotification('Actualizando datos...', 'info');

    try {
        const response = await fetch('/api/update-comparison', { method: 'POST' }); // Cambiado a POST
        const data = await response.json();

        if (data.success) {
            showNotification('Datos actualizados correctamente.', 'success');
        } else {
            showNotification('Error al actualizar los datos.', 'error');
        }
    } catch (error) {
        showNotification('Error de conexión al actualizar.', 'error');
    }
}

// Unificar manejo de visibilidad del botón de pedidos
function updateNewOrdersButtonVisibility() {
    const button = document.getElementById('new-orders-button');
    if (newOrders.length > 0) {
        button.style.display = 'block';
    } else {
        button.style.display = 'none';
    }
}

// Llamar esta función después de actualizar pedidos
updateNewOrdersButtonVisibility();

// --- POLLING AUTOMÁTICO DE NUEVOS PEDIDOS ---
setInterval(async () => {
    try {
        const response = await fetch('/api/update-comparison', { method: 'POST' });
        const data = await response.json();
        if (data.success) {
            // Actualizar variable global y contador
            newOrders = data.newOrders;
            updateNewOrdersCount();
            // Actualizar lista de pedidos en el panel si está abierto
            const panel = document.getElementById('new-orders-panel');
            if (panel && panel.style.display === 'block') {
                const ordersList = document.getElementById('orders-list');
                ordersList.textContent = '';
                newOrders.forEach((order, index) => {
                    const orderContainer = document.createElement('div');
                    orderContainer.style.marginBottom = '15px';
                    orderContainer.style.padding = '15px';
                    orderContainer.style.border = '1px solid #ddd';
                    orderContainer.style.borderRadius = '5px';
                    orderContainer.style.background = '#fff';
                    orderContainer.style.overflow = 'auto';
                    orderContainer.style.maxHeight = '200px';
                    const orderJson = JSON.stringify(order, null, 2);
                    const orderText = document.createElement('pre');
                    orderText.textContent = orderJson;
                    orderText.style.whiteSpace = 'pre-wrap';
                    orderText.style.wordBreak = 'break-word';
                    orderText.style.margin = '0';
                    orderText.style.fontSize = '14px';
                    orderText.style.lineHeight = '1.5';
                    orderText.style.color = '#333';
                    orderText.style.background = '#f4f4f4';
                    orderText.style.padding = '10px';
                    orderText.style.borderRadius = '5px';
                    const copyButton = document.createElement('button');
                    copyButton.textContent = 'Copiar JSON';
                    copyButton.style.marginTop = '10px';
                    copyButton.style.background = '#007bff';
                    copyButton.style.color = 'white';
                    copyButton.style.border = 'none';
                    copyButton.style.borderRadius = '5px';
                    copyButton.style.padding = '5px 10px';
                    copyButton.style.cursor = 'pointer';
                    copyButton.addEventListener('click', () => {
                        navigator.clipboard.writeText(orderJson).then(() => {
                            alert(`Pedido ${index + 1} copiado al portapapeles.`);
                        }).catch(err => {
                            console.error('Error al copiar el JSON:', err);
                            alert('Error al copiar el JSON. Por favor, intenta de nuevo.');
                        });
                    });
                    orderContainer.appendChild(orderText);
                    orderContainer.appendChild(copyButton);
                    ordersList.appendChild(orderContainer);
                });
            }
        }
    } catch (error) {
        console.error('Error al verificar nuevos pedidos (polling):', error);
    }
}, 10000); // Cada 10 segundos

// Actualizar el saludo para incluir la hora actual
function updateGreetingAndBackground() {
    const greetingElement = document.getElementById('dynamic-greeting');
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');

    let greetingMessage = '';
    let backgroundClass = '';

    if (hour >= 6 && hour < 12) {
        greetingMessage = `🌅 Buenos días - ${hour}:${minutes}`;
        backgroundClass = 'morning';
    } else if (hour >= 12 && hour < 18) {
        greetingMessage = `☀️ Buenas tardes - ${hour}:${minutes}`;
        backgroundClass = 'afternoon';
    } else {
        greetingMessage = `🌙 Buenas noches - ${hour}:${minutes}`;
        backgroundClass = 'night';
    }

    // Actualizar el mensaje de saludo
    greetingElement.textContent = greetingMessage;

    // Cambiar la clase del banner para el fondo dinámico
    greetingElement.className = `greeting ${backgroundClass}`;
}

// Llamar a la función al cargar la página y actualizar cada minuto
updateGreetingAndBackground();
setInterval(updateGreetingAndBackground, 60000);

// NAV buttons (outside DOMContentLoaded to ensure they exist in different load cases)
document.addEventListener('DOMContentLoaded', () => {
    const navStats = document.getElementById('nav-stats');
    const navDashboard = document.getElementById('nav-dashboard');
    if (navStats) navStats.addEventListener('click', (e) => { e.preventDefault(); showView('stats'); });
    if (navDashboard) navDashboard.addEventListener('click', (e) => { e.preventDefault(); showView('dashboard'); });
});
