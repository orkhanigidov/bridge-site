/**
 * Path A / Path B source display. Shows either the source strings the runner
 * serves with a predefined case, or the visitor's own pasted pair — it never
 * edits or generates code.
 */

const PLACEHOLDER = '// no source provided for this path — pick a predefined case or paste your pair above';

export function initCodeTabs({ tabDirect, tabBridge, codeView }) {
    const sources = { direct: '', bridge: '' };
    let active = 'direct';

    function render() {
        const text = sources[active] || PLACEHOLDER;
        codeView.textContent = text;
    }

    function setActive(mode) {
        active = mode;
        const activeTab = mode === 'direct' ? tabDirect : tabBridge;
        const idleTab = mode === 'direct' ? tabBridge : tabDirect;
        activeTab.classList.add('is-active');
        activeTab.setAttribute('aria-selected', 'true');
        idleTab.classList.remove('is-active');
        idleTab.setAttribute('aria-selected', 'false');
        render();
    }

    // Initialize ARIA attributes
    tabDirect.setAttribute('role', 'tab');
    tabDirect.setAttribute('aria-selected', 'true');
    tabDirect.setAttribute('aria-controls', 'code-view');
    tabBridge.setAttribute('role', 'tab');
    tabBridge.setAttribute('aria-selected', 'false');
    tabBridge.setAttribute('aria-controls', 'code-view');
    codeView.setAttribute('role', 'tabpanel');
    codeView.setAttribute('aria-labelledby', 'tab-cxx');

    tabDirect.addEventListener('click', () => setActive('direct'));
    tabBridge.addEventListener('click', () => setActive('bridge'));

    // Keyboard navigation
    const tabs = [tabDirect, tabBridge];
    tabs.forEach((tab, index) => {
        tab.addEventListener('keydown', (e) => {
            let newIndex = index;
            if (e.key === 'ArrowRight') newIndex = (index + 1) % tabs.length;
            else if (e.key === 'ArrowLeft') newIndex = (index - 1 + tabs.length) % tabs.length;
            else if (e.key === 'Home') newIndex = 0;
            else if (e.key === 'End') newIndex = tabs.length - 1;
            else return;

            e.preventDefault();
            tabs[newIndex].focus();
            setActive(tabs[newIndex] === tabDirect ? 'direct' : 'bridge');
        });
    });

    return {
        setSource(path, text) {
            if (path in sources) sources[path] = String(text || '');
            render();
        },
    };
}