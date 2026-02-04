// ==UserScript==
// @name         Malaysia Holidays Scraper
// @namespace    http://tampermonkey.net/
// @version      8.0
// @description  Scraper UI for Malaysia public & school holidays and download as csv
// @match        https://publicholidays.com.my/*
// @grant        GM_download
// @author       aturcara
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const FLAG = 'PH_SCRAPE_NEXT';
    const seen = new Set();

    /********************
     * HELPERS
     ********************/
    const clean = t => t.replace(/\s+/g, ' ').trim();

    const isoDate = (text, year) =>
        new Date(`${text} ${year}`).toISOString().slice(0, 10);

    const downloadCSV = (filename, csv) => {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        GM_download({ url, name: filename, saveAs: true });
    };

    /********************
     * Top Clear UI Padding
     ********************/
    const go = (url, task) => {
        localStorage.setItem(FLAG, task);
        window.location.href = url;
    };
    const styleFix = document.createElement('style');
    styleFix.textContent = `
    body {
        padding-top: 0 !important;
        margin-top: 0 !important;
    }
    `;
    document.head.appendChild(styleFix);

    /********************
     * TOP BAR UI
     ********************/
    const bar = document.createElement('div');
    bar.id = 'hs-sticky-bar';
    bar.style = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        z-index: 2147483647;
        background: #0f172a;
        color: #e5e7eb;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 14px;
        box-sizing: border-box;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        box-shadow: 0 2px 10px rgba(0,0,0,.25);
    `;

    bar.innerHTML = `
        <strong style="white-space:nowrap">Holiday Scraper</strong>
        <button id="scrape-public">Public Holidays</button>
        <button id="scrape-school">School Holidays</button>
        <span id="hs-status" style="margin-left:auto;color:#94a3b8">
            Idle
        </span>
    `;

    const mount = () => {
        if (!document.body) return;
        if (!document.getElementById('hs-sticky-bar')) {
            document.body.prepend(bar);
            document.body.style.paddingTop = '50px'; // hardcode safe padding to avoid offsetHeight 0 issues
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }

    // Check every second to ensure it wasn't removed
    setInterval(mount, 1000);

    bar.querySelectorAll('button').forEach(btn => {
        btn.style = `
            padding:4px 10px;
            border-radius:6px;
            border:none;
            cursor:pointer;
            background:#1e293b;
            color:#e5e7eb;
            font-size:12px;
        `;
        btn.onmouseenter = () => btn.style.background = '#334155';
        btn.onmouseleave = () => btn.style.background = '#1e293b';
    });

    const statusEl = document.getElementById('hs-status');
    const setStatus = msg => statusEl.textContent = msg;

    /********************
     * PUBLIC HOLIDAYS
     ********************/
    function scrapePublic() {
        setStatus('Scraping public holidays…');
        seen.clear();

        const rows = [];

        document.querySelectorAll('h2[id$="-public-holidays"]').forEach(h2 => {
            const year = h2.id.match(/\d{4}/)?.[0];
            const table = h2.nextElementSibling;
            if (!year || !table || table.tagName !== 'TABLE') return;

            table.querySelectorAll('tbody tr').forEach(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length < 4) return;

                const dateText = clean(tds[0].innerText);
                const holiday = clean(tr.querySelector('.summary')?.innerText || '');
                const states = clean(tds[3].innerText);

                if (!dateText || !holiday || !states) return;

                const date = isoDate(dateText, year);
                const key = `public|${date}|${holiday}|${states}`;
                if (seen.has(key)) return;
                seen.add(key);

                rows.push(`${year},public,"${states}","${holiday}",${date}`);
            });
        });

        const csv = 'Year,Type,States,HolidayName,Date\n' + rows.join('\n');
        downloadCSV('malaysia-public-holidays.csv', csv);
        setStatus(`✓ Exported ${rows.length} public holidays`);
    }

    /********************
     * SCHOOL HOLIDAYS
     ********************/
    function scrapeSchool() {
        setStatus('Scraping school holidays…');
        seen.clear();

        const rows = [];
        const year = document.querySelector('h1')?.innerText.match(/\d{4}/)?.[0];
        if (!year) return setStatus('⚠️ Year not detected');

        const groups = [
            { id: 'kumpulan-a', name: 'Kumpulan A', states: 'Kedah, Kelantan, Terengganu' },
            {
                id: 'kumpulan-b',
                name: 'Kumpulan B',
                states: 'Johor, Kuala Lumpur, Labuan, Melaka, Negeri Sembilan, Pahang, Perlis, Penang, Perak, Putrajaya, Sabah, Sarawak, Selangor'
            }
        ];

        groups.forEach(g => {
            let h2 = document.querySelector(`#${g.id}`);
            if (!h2) return;

            let table = h2.nextElementSibling;
            while (table && table.tagName !== 'TABLE') table = table.nextElementSibling;
            if (!table) return;

            table.querySelectorAll('tbody tr').forEach(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length < 3) return;

                const name = clean(tds[0].innerText);
                if (/first day of school/i.test(name)) return;

                const start = isoDate(tds[1].innerText.split('\n')[0], year);
                const end = isoDate(tds[2].innerText.split('\n')[0], year);

                const key = `school|${g.name}|${name}|${start}|${end}`;
                if (seen.has(key)) return;
                seen.add(key);

                rows.push(
                    `${year},school,"${g.name}","${g.states}","${name}",${start},${end}`
                );
            });
        });

        const other = document.querySelector('#tablepress-389');
        if (other) {
            other.querySelectorAll('tbody tr').forEach(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length < 4) return;

                const name = clean(tds[0].innerText);
                const states = clean(tds[3].innerText);
                const start = isoDate(tds[1].innerText.split('\n')[0], year);
                const end = isoDate(tds[2].innerText.split('\n')[0], year);

                const key = `school|other|${name}|${start}|${end}|${states}`;
                if (seen.has(key)) return;
                seen.add(key);

                rows.push(
                    `${year},school,"Other School Holidays","${states}","${name}",${start},${end}`
                );
            });
        }

        const csv =
            'Year,Type,GroupName,States,HolidayName,StartDate,EndDate\n' +
            rows.join('\n');

        downloadCSV(`malaysia-school-holidays-${year}.csv`, csv);
        setStatus(`✓ Exported ${rows.length} school holidays`);
    }

    /********************
     * BUTTON LOGIC
     ********************/
    document.getElementById('scrape-public').onclick = () => {
        if (location.pathname.includes('school-holidays')) {
            go('https://publicholidays.com.my/', 'public');
        } else scrapePublic();
    };

    document.getElementById('scrape-school').onclick = () => {
        if (!location.pathname.includes('school-holidays')) {
            go('https://publicholidays.com.my/school-holidays/', 'school');
        } else scrapeSchool();
    };

    /********************
     * AUTO-RUN AFTER REDIRECT
     ********************/
    const next = localStorage.getItem(FLAG);
    if (next) {
        localStorage.removeItem(FLAG);
        setTimeout(() => {
            if (next === 'public') scrapePublic();
            if (next === 'school') scrapeSchool();
        }, 500);
    }
})();
