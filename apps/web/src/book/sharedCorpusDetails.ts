import type { Book } from '@reverie/core'
import type { HouseholdBook } from '../data/household'

export function sharedCorpusDetailsDiffer(
  book: Pick<
    Book,
    | 'series'
    | 'position'
    | 'seriesCount'
    | 'status'
    | 'genre'
    | 'subgenre'
    | 'genres'
    | 'subgenres'
    | 'cover'
    | 'pub'
  >,
  householdWork: HouseholdBook | undefined,
): boolean {
  return (
    !!householdWork &&
    (book.series !== householdWork.series ||
      book.position !== (householdWork.position ?? '') ||
      book.seriesCount !== householdWork.seriesCount ||
      book.status !== householdWork.seriesStatus ||
      book.genre !== householdWork.primaryGenre ||
      book.subgenre !== householdWork.subgenre ||
      JSON.stringify(book.genres) !== JSON.stringify(householdWork.genres) ||
      JSON.stringify(book.subgenres) !== JSON.stringify(householdWork.subgenres) ||
      book.cover !== householdWork.cover ||
      book.pub.y !== householdWork.publicationYear ||
      book.pub.m !== householdWork.publicationMonth ||
      book.pub.d !== householdWork.publicationDay)
  )
}
