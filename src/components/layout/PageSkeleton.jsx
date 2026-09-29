// Shown while a page's code loads (App.jsx, CRITICAL_REVIEW.md §39): the
// rough shape of a page, so the wait reads as loading and not as a blank
// screen. Usually a fraction of a second; offline the pages are already
// cached by the service worker.
export default function PageSkeleton() {
  return (
    <div className="container page-skeleton" role="status" aria-label="טוען…">
      <div className="page-skeleton-bar" style={{ width: "45%", height: 28 }} />
      <div className="page-skeleton-bar" style={{ height: 120 }} />
      <div className="page-skeleton-bar" style={{ height: 72 }} />
      <div className="page-skeleton-bar" style={{ height: 72 }} />
    </div>
  );
}
