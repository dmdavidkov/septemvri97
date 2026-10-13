// m/<game>.html is the link preview of a shared match (scripts/share-cards.mjs). Visitors go on to that match on the site.
const id = location.pathname.match(/([\w-]+)\.html$/)?.[1];
location.replace(id ? `../?game=${encodeURIComponent(id)}#machove` : '../');
