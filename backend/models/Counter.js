const mongoose = require('mongoose');

// Backs atomic auto-increment counters (e.g. per-user video entryNumber).
// findOneAndUpdate's $inc is atomic in MongoDB, so concurrent callers can
// never be handed the same sequence value — unlike computing "current max
// + 1" from a query, which can race under concurrent writes.
const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

module.exports = mongoose.model('Counter', CounterSchema);
