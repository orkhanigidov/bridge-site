/**
 * Renders config-driven page content: the resource links and the BibTeX block.
 * Links with an empty href or '#' render as explicit "pending" slots, never as dead links.
 */
import { RESOURCE_LINKS, THESIS_BIBTEX } from '../config/siteConfig.js';

export function renderResourceContent({ linksContainer, bibtexCode }) {
    linksContainer.textContent = '';
    for (const link of RESOURCE_LINKS) {
        const row = document.createElement('div');
        row.className = 'link-row';

        const name = document.createElement('p');
        const isPending = !link.href || link.href === '#';
        if (!isPending) {
            const anchor = document.createElement('a');
            anchor.href = link.href;
            anchor.textContent = link.label;
            anchor.rel = 'noopener';
            name.append(anchor);
        } else {
            name.textContent = link.label;
        }

        const note = document.createElement('p');
        note.className = 'link-note';
        note.textContent = link.note;
        row.append(name, note);

        if (isPending) {
            const pending = document.createElement('span');
            pending.className = 'link-pending';
            pending.textContent = 'link pending';
            row.append(pending);
        }

        linksContainer.append(row);
    }

    bibtexCode.textContent = THESIS_BIBTEX;
}