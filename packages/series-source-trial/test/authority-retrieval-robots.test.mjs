import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseRobots, robotsAccess } from '../src/authority/retrieval/robots.mjs'

test('combines exact case-insensitive product groups instead of wildcard rules', () => {
  const groups = parseRobots(`
User-agent: *
Disallow: /

User-agent: ReverieAuthorityScout
Disallow: /private

User-agent: reverieauthorityscout
Allow: /private/series
`)
  assert.equal(robotsAccess(groups, 'https://author.example/books').allowed, true)
  assert.equal(robotsAccess(groups, 'https://author.example/private').allowed, false)
  assert.equal(robotsAccess(groups, 'https://author.example/private/series').allowed, true)
})

test('uses the longest path match and lets allow win an equal tie', () => {
  const groups = parseRobots(`
User-agent: *
Disallow: /books
Allow: /books/public
Disallow: /equal
Allow: /equal
`)
  assert.equal(robotsAccess(groups, 'https://author.example/books/secret').allowed, false)
  assert.equal(robotsAccess(groups, 'https://author.example/books/public/list').allowed, true)
  assert.equal(robotsAccess(groups, 'https://author.example/equal').allowed, true)
})

test('supports wildcards, terminal matches, comments, and query strings', () => {
  const groups = parseRobots(`
User-agent: * # all crawlers
Disallow: /*?preview=*
Disallow: /draft$
Allow: /draft/public
`)
  assert.equal(robotsAccess(groups, 'https://author.example/books?preview=yes').allowed, false)
  assert.equal(robotsAccess(groups, 'https://author.example/draft').allowed, false)
  assert.equal(robotsAccess(groups, 'https://author.example/drafts').allowed, true)
  assert.equal(robotsAccess(groups, 'https://author.example/draft/public').allowed, true)
})

test('normalizes literal Unicode, percent case, and encoded unreserved octets', () => {
  const groups = parseRobots(`
User-agent: *
Disallow: /café
Disallow: /encoded%2Fpath
Disallow: /~private
`)
  assert.equal(robotsAccess(groups, 'https://author.example/café').allowed, false)
  assert.equal(robotsAccess(groups, 'https://author.example/encoded%2fpath').allowed, false)
  assert.equal(robotsAccess(groups, 'https://author.example/%7eprivate').allowed, false)

  const precedence = parseRobots(`
User-agent: *
Disallow: /é
Allow: /*aaa
`)
  assert.equal(robotsAccess(precedence, 'https://author.example/éaaa').allowed, true)
})

test('ignores rules outside groups and empty disallow values', () => {
  const groups = parseRobots(`
Disallow: /
User-agent: *
Disallow:
`)
  assert.equal(robotsAccess(groups, 'https://author.example/anything').allowed, true)
  assert.equal(robotsAccess(groups, 'https://author.example/robots.txt').allowed, true)
})
