from transformers import AutoTokenizer, AutoModelForSequenceClassification

tokenizer = AutoTokenizer.from_pretrained("/home/nightsafe/nightsafe/models/stage2/nightsafe_stage2_final")
model = AutoModelForSequenceClassification.from_pretrained("/home/nightsafe/nightsafe/models/stage2/nightsafe_stage2_final")
model.eval()

print("Stage 2 model loaded successfully")