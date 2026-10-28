# Trained sign model

Put the files produced by `ml/train_lstm.py` (or the Colab notebook) here:

- `isl_lstm.onnx`: the LSTM classifier
- `labels.json`: class names in output order
- `report.json`: test accuracy and the most confused pairs (optional, for your records)

The server loads them on start-up. Without them, recognition uses the starter templates plus any signs recorded on the Teach screen.
