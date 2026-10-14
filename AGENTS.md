# AI Agents Best Practices for Website Development

This document outlines the best practices and guidelines for AI agents contributing to this HTML/CSS/JS website.

## General Principles
- **Surgical Changes**: Make precise, complete changes. Avoid unrelated modifications to existing code.
- **Maintainability**: Prioritize clean, readable, and well-structured code over clever hacks.
- **Consistency**: Follow the existing naming conventions and architectural patterns used in the project.

## HTML Guidelines
- **Semantic HTML**: Use semantic tags (`<header>`, `<main>`, `<footer>`, `<section>`, `<article>`, etc.) to improve accessibility and SEO.
- **Accessibility (a11y)**: Always include `alt` text for images and ensure proper ARIA roles where necessary.
- **Structure**: Keep the DOM tree flat where possible to improve rendering performance.

## CSS Guidelines
- **Responsive Design**: Use a mobile-first approach. Use relative units (`rem`, `em`, `%`, `vh`, `vw`) instead of fixed pixels (`px`) for layout.
- **CSS Variables**: Use CSS custom properties for colors, spacing, and typography to ensure consistency and easy updates.
- **Avoid `!important`**: Use specific selectors instead of `!important` to manage specificity.
- **Organization**: Group related styles together and use a consistent naming convention (e.g., BEM).

## JavaScript Guidelines
- **Modern JS**: Use ES6+ features (arrow functions, destructuring, template literals, async/await).
- **DOM Manipulation**: Minimize direct DOM manipulation. Use efficient selectors and avoid repeated lookups.
- **Performance**: Optimize event listeners (e.g., using event delegation) and avoid blocking the main thread.
- **Clean Code**: Keep functions small and focused on a single responsibility.

## Validation & Testing
- **Cross-Browser Check**: Ensure changes work across major modern browsers.
- **Linting**: Run available linters to catch syntax errors and style inconsistencies.
- **Verification**: Always verify that changes preserve existing behavior and do not introduce regressions.
