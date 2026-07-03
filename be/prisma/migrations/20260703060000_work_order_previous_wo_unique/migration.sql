-- Each work order can be the immediate predecessor of at most one next-phase
-- work order. previousWoId is nullable, so every chain head (null) is allowed;
-- Postgres treats NULLs as distinct in a UNIQUE index. Concurrent double-advance
-- of the same source work order now collides on this constraint instead of
-- forking the chain into two active next-phase work orders for one HET.
CREATE UNIQUE INDEX "workOrder_previousWoId_key" ON "workOrder"("previousWoId");
