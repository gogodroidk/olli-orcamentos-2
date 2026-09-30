WITH reviewed_document_priorities(priority) AS (
  VALUES
    ('P0'), ('P0'), ('P0'), ('P0'), ('P0'), ('P0'), ('P0'), ('P0'), ('P1'), ('P0'),
    ('P0'), ('P1'), ('P2'), ('P1'), ('P2'), ('P0'), ('P1'), ('P1'), ('P1'), ('P1')
)
SELECT priority, COUNT(*) AS count
FROM reviewed_document_priorities
GROUP BY priority
ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END;

