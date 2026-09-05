# Homepage alignment — September 2026

The public page now centers on a personal library that feels like home, with Next read as the first useful activity inside it. This supersedes the equal Library / Household / Series / Universes feature hierarchy in the earlier landing capability audit.

The headline is “Find your next read in your own library.” Supporting copy makes room for personal notes, memories, and the reader’s own pace. Visitors can try a clearly labeled fictional library before creating an account. Available to read includes owned and borrowed books; Wishlist is a separate scope. Starting a sample read removes it from the candidate list and shows it under Reading now. Saving is visible, resettable, and confined to memory.

The sample and signed-in Next read route share `NextReadCardView`. The reader route retains its mutation, navigation, pending state, and error handling. The sample uses the same candidate and start-reading helpers without importing any persistence hooks. With no taste history, the example correctly says “A place to start” and “From your personal library”; it presents no invented match scores or learned preferences.

The page then explains starting with a few books, selecting a read, and keeping a personal reading record. Nine rooms remain a full product demonstration. On phones the room choices scroll horizontally, keeping the selected room close to the controls. Descriptions evoke a place instead of listing font names or implementation details. Household, planning, sharing, and purchase links sit further down the page; money claims still follow the live configuration. The large synthetic universe and household diagrams have been removed.

Search and social descriptions follow the same promise. The 1200 × 630 social image is captured from the actual homepage composition with presentation sizing for that format. The coverless sample books use Reverie’s real fallback artwork.

Verification covers sample behavior and lack of persistent requests, signed-in save/start behavior, explicit sign-in and sign-up destinations, mobile navigation, 320/390/768/1440 viewport bounds, room selection and keyboard navigation, reduced motion, and social-image delivery. Full validation outcomes are recorded in the PR and delivery record; this note describes the final behavior, not a substitute for those results.
