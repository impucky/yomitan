/*
 * Copyright (C) 2023  Yomitan Authors
 * Copyright (C) 2020-2022  Yomichan Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {fileURLToPath} from 'node:url';
import path from 'path';
import {describe, expect} from 'vitest';
import {DocumentUtil} from '../ext/js/dom/document-util.js';
import {DOMTextScanner} from '../ext/js/dom/dom-text-scanner.js';
import {TextSourceElement} from '../ext/js/dom/text-source-element.js';
import {TextSourceRange} from '../ext/js/dom/text-source-range.js';
import {domTest} from './document-test.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// DOMRect class definition
class DOMRect {
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    constructor(x, y, width, height) {
        /** @type {number} */
        this._x = x;
        /** @type {number} */
        this._y = y;
        /** @type {number} */
        this._width = width;
        /** @type {number} */
        this._height = height;
    }

    /** @type {number} */
    get x() { return this._x; }
    /** @type {number} */
    get y() { return this._y; }
    /** @type {number} */
    get width() { return this._width; }
    /** @type {number} */
    get height() { return this._height; }
    /** @type {number} */
    get left() { return this._x + Math.min(0, this._width); }
    /** @type {number} */
    get right() { return this._x + Math.max(0, this._width); }
    /** @type {number} */
    get top() { return this._y + Math.min(0, this._height); }
    /** @type {number} */
    get bottom() { return this._y + Math.max(0, this._height); }
    /** @returns {string} */
    toJSON() { return '<not implemented>'; }
}


/**
 * @param {Element} element
 * @param {string|undefined} selector
 * @returns {?Element}
 */
function querySelectorChildOrSelf(element, selector) {
    return selector ? element.querySelector(selector) : element;
}

/**
 * @param {import('jsdom').DOMWindow} window
 * @param {?Node} node
 * @returns {?Text|Node}
 */
function getChildTextNodeOrSelf(window, node) {
    if (node === null) { return null; }
    const Node = window.Node;
    const childNode = node.firstChild;
    return (childNode !== null && childNode.nodeType === Node.TEXT_NODE ? childNode : node);
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function getPrototypeOfOrNull(value) {
    try {
        return Object.getPrototypeOf(value);
    } catch (e) {
        return null;
    }
}

/**
 * @param {Document} document
 * @returns {?Element}
 */
function findImposterElement(document) {
    // Finds the imposter element based on it's z-index style
    return document.querySelector('div[style*="2147483646"]>*');
}

describe('DocumentUtil', () => {
    const testDoc = domTest(path.join(dirname, 'data/html/test-document1.html'));
    testDoc('Text scanning functions', ({window}) => {
        const {document} = window;
        for (const testElement of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.test[data-test-type=scan]'))) {
            // Get test parameters
            const {
                elementFromPointSelector,
                caretRangeFromPointSelector,
                startNodeSelector,
                startOffset,
                endNodeSelector,
                endOffset,
                resultType,
                sentenceScanExtent,
                sentence,
                hasImposter,
                terminateAtNewlines
            } = testElement.dataset;

            const elementFromPointValue = querySelectorChildOrSelf(testElement, elementFromPointSelector);
            const caretRangeFromPointValue = querySelectorChildOrSelf(testElement, caretRangeFromPointSelector);
            const startNode = getChildTextNodeOrSelf(window, querySelectorChildOrSelf(testElement, startNodeSelector));
            const endNode = getChildTextNodeOrSelf(window, querySelectorChildOrSelf(testElement, endNodeSelector));

            const startOffset2 = parseInt(/** @type {string} */ (startOffset), 10);
            const endOffset2 = parseInt(/** @type {string} */ (endOffset), 10);
            const sentenceScanExtent2 = parseInt(/** @type {string} */ (sentenceScanExtent), 10);
            const terminateAtNewlines2 = (terminateAtNewlines !== 'false');

            expect(elementFromPointValue).not.toStrictEqual(null);
            expect(caretRangeFromPointValue).not.toStrictEqual(null);
            expect(startNode).not.toStrictEqual(null);
            expect(endNode).not.toStrictEqual(null);

            // Setup functions
            document.elementFromPoint = () => elementFromPointValue;

            document.caretRangeFromPoint = (x, y) => {
                const imposter = getChildTextNodeOrSelf(window, findImposterElement(document));
                expect(!!imposter).toStrictEqual(hasImposter === 'true');

                const range = document.createRange();
                range.setStart(/** @type {Node} */ (imposter ? imposter : startNode), startOffset2);
                range.setEnd(/** @type {Node} */ (imposter ? imposter : startNode), endOffset2);

                // Override getClientRects to return a rect guaranteed to contain (x, y)
                range.getClientRects = () => {
                    /** @type {import('test/document-types').PseudoDOMRectList} */
                    const domRectList = Object.assign(
                        [new DOMRect(x - 1, y - 1, 2, 2)],
                        {
                            /**
                             * @this {DOMRect[]}
                             * @param {number} index
                             * @returns {DOMRect}
                             */
                            item: function item(index) { return this[index]; }
                        }
                    );
                    return domRectList;
                };
                return range;
            };

            // Test docRangeFromPoint
            const source = DocumentUtil.getRangeFromPoint(0, 0, {
                deepContentScan: false,
                normalizeCssZoom: true
            });
            switch (resultType) {
                case 'TextSourceRange':
                    expect(getPrototypeOfOrNull(source)).toStrictEqual(TextSourceRange.prototype);
                    break;
                case 'TextSourceElement':
                    expect(getPrototypeOfOrNull(source)).toStrictEqual(TextSourceElement.prototype);
                    break;
                case 'null':
                    expect(source).toStrictEqual(null);
                    break;
                default:
                    expect.unreachable();
                    break;
            }
            if (source === null) { continue; }

            // Sentence info
            const terminatorString = '…。．.？?！!';
            const terminatorMap = new Map();
            for (const char of terminatorString) {
                terminatorMap.set(char, [false, true]);
            }
            const quoteArray = [['「', '」'], ['『', '』'], ['\'', '\''], ['"', '"']];
            const forwardQuoteMap = new Map();
            const backwardQuoteMap = new Map();
            for (const [char1, char2] of quoteArray) {
                forwardQuoteMap.set(char1, [char2, false]);
                backwardQuoteMap.set(char2, [char1, false]);
            }

            // Test docSentenceExtract
            const sentenceActual = DocumentUtil.extractSentence(
                source,
                false,
                sentenceScanExtent2,
                terminateAtNewlines2,
                terminatorMap,
                forwardQuoteMap,
                backwardQuoteMap
            ).text;
            expect(sentenceActual).toStrictEqual(sentence);

            // Clean
            source.cleanup();
        }
    });
});

describe('DOMTextScanner', () => {
    const testDoc = domTest(path.join(dirname, 'data/html/test-document1.html'));
    testDoc('Seek functions', async ({window}) => {
        const {document} = window;
        for (const testElement of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.test[data-test-type=text-source-range-seek]'))) {
            // Get test parameters
            const {
                seekNodeSelector,
                seekNodeIsText,
                seekOffset,
                seekLength,
                seekDirection,
                expectedResultNodeSelector,
                expectedResultNodeIsText,
                expectedResultOffset,
                expectedResultContent
            } = testElement.dataset;

            const seekOffset2 = parseInt(/** @type {string} */ (seekOffset), 10);
            const seekLength2 = parseInt(/** @type {string} */ (seekLength), 10);
            const expectedResultOffset2 = parseInt(/** @type {string} */ (expectedResultOffset), 10);

            /** @type {?Node} */
            let seekNode = testElement.querySelector(/** @type {string} */ (seekNodeSelector));
            if (seekNodeIsText === 'true' && seekNode !== null) {
                seekNode = seekNode.firstChild;
            }

            /** @type {?Node} */
            let expectedResultNode = testElement.querySelector(/** @type {string} */ (expectedResultNodeSelector));
            if (expectedResultNodeIsText === 'true' && expectedResultNode !== null) {
                expectedResultNode = expectedResultNode.firstChild;
            }

            const {node, offset, content} = (
                seekDirection === 'forward' ?
                new DOMTextScanner(/** @type {Node} */ (seekNode), seekOffset2, true, false).seek(seekLength2) :
                new DOMTextScanner(/** @type {Node} */ (seekNode), seekOffset2, true, false).seek(-seekLength2)
            );

            expect(node).toStrictEqual(expectedResultNode);
            expect(offset).toStrictEqual(expectedResultOffset2);
            expect(content).toStrictEqual(expectedResultContent);
        }
    });
});