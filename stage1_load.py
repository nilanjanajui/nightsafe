from transformers import AutoTokenizer, AutoModelForSequenceClassification

tokenizer = AutoTokenizer.from_pretrained("/home/nightsafe/nightsafe/models/stage1/nightsafe_stage1_final")
model = AutoModelForSequenceClassification.from_pretrained("/home/nightsafe/nightsafe/models/stage1/nightsafe_stage1_final")
model.eval()

print("Model loaded successfully")