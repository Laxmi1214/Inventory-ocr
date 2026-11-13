import re
from typing import Dict, List, Optional, Any

# OS, editor, and UI window words that should NEVER be recognized as medicine names or batch numbers
NOISE_EXACT = {
    'FILE', 'EDIT', 'FORMAT', 'VIEW', 'HELP', 'UNTITLED', 'NOTEPAD',
    'PP-OCR', 'PADDLEO', 'WINDOW', 'CHROME', 'DESKTOP', 'SCREEN', 'BUTTON',
    'MENU', 'TAB', 'CLOSE', 'MINIMIZE', 'MAXIMIZE', 'SAVE', 'SAVE AS',
    'OPEN', 'OPEN SA', 'NEW', 'SETTINGS', 'ACTIVE', 'MANUAL', 'CONFIRM'
}

NOISE_SUBSTRINGS = [
    'UNTITLED', 'NOTEPAD', 'PADDLE', 'PP-OCR', 'EASYOCR', 'VSCODE',
    'TASKBAR', 'EXPLORER', 'WINDOWS', 'CHROME', 'EDGE', 'DESKTOP',
    'WHATSAPP', 'WNATSAPP', 'LAKSHMI', 'LAKSHML', 'TODAY AT'
]

def is_noise_text(text: str) -> bool:
    if not text:
        return True
    clean = text.strip()
    if len(clean) <= 1:
        return True
    upper = clean.upper()
    if upper in NOISE_EXACT:
        return True
    if any(ns in upper for ns in NOISE_SUBSTRINGS):
        return True
    # If text is only punctuation or digits like "00"
    if re.fullmatch(r'[\W_0-9]+', clean) and len(clean) <= 3:
        return True
    return False

def clean_label_val(val: str) -> str:
    """Strips leading colons, hyphens, slashes, spaces from extracted value"""
    return re.sub(r'^[\s.:;=\-_/]+', '', val).strip()

class PharmaEntityExtractor:
    """
    Robust Pharmaceutical Entity Extractor with Multi-Line Lookahead.
    Extracts live, real values:
      - Product / Medicine Name
      - SKU
      - Purchase Order (PO Number)
      - Batch / Lot Number
      - Manufacturing Date (Mfg Date)
      - Expiry Date (Exp Date)
      - Price / MRP / Rate
    """

    STRENGTH_REGEX = re.compile(
        r'\b([A-Za-z]{3,}(?:\s+[A-Za-z]+)*\s+[0-9]+(?:\.[0-9]+)?\s*(?:mg|ml|gm|mcg|tablets?|capsules?|suspension|syrup|injection)(?:\s+[A-Za-z]+)*)\b',
        re.IGNORECASE
    )

    # Universal Date Regex supporting:
    # 1. DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD,MM/YYYY
    # 2. YYYY-MM-DD, YYYY/MM/DD
    # 3. MM/YYYY, MM-YYYY, MM/YY
    # 4. Mon YYYY (e.g. Aug 2026, 15 Aug 2026)
    DATE_REGEX_STR = r'(?:(?:20)?[1-4][0-9][\/\-\.][0-1]?[0-9][\/\-\.][0-3]?[0-9]|[0-3]?[0-9][\/\-\.,][0-1]?[0-9][\/\-\.,](?:20)?[1-4][0-9]|[0-1]?[0-9][\/\-\.,](?:20)?[1-4][0-9]|[0-3]?[0-9]?\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\/\-\.\s]*(?:20)?[1-4][0-9])'

    @classmethod
    def clean_date_str(cls, d: str) -> str:
        d = d.strip()
        # Normalize commas and dots to slashes
        d = re.sub(r'[,.]', '/', d)
        # Normalize dashes to slashes if in standard date format
        d = re.sub(r'-', '/', d)
        d = re.sub(r'/+', '/', d)
        return d

    @classmethod
    def extract_entities(cls, ocr_lines: List[Dict[str, Any]]) -> Dict[str, Any]:
        all_lines_text = [str(line.get("text", "")).strip() for line in ocr_lines if str(line.get("text", "")).strip()]
        full_text = "\n".join(all_lines_text)

        if not all_lines_text:
            return {
                "detected_text": "",
                "all_lines": [],
                "medicine_name": "No text detected",
                "sku": "",
                "po_number": "",
                "batch_number": "",
                "expiry_date": "",
                "mfg_date": "",
                "mrp": None,
                "lines_count": 0,
            }

        extracted_name = ""
        extracted_sku = ""
        extracted_po = ""
        extracted_batch = ""
        extracted_mfg = ""
        extracted_expiry = ""
        extracted_mrp: Optional[float] = None

        n = len(all_lines_text)

        # Helper to inspect up to 4 lookahead lines
        def get_lookahead_tokens(start_idx: int, max_depth: int = 4) -> List[str]:
            tokens = []
            for k in range(start_idx, min(n, start_idx + max_depth)):
                t = all_lines_text[k].strip()
                if t and not is_noise_text(t):
                    tokens.append(t)
            return tokens

        # -------------------------------------------------------------
        # PASS 1: Multi-Line Lookahead Window
        # -------------------------------------------------------------
        for i in range(n):
            line = all_lines_text[i]
            if is_noise_text(line):
                continue

            upper = line.upper()

            # 1. PRODUCT NAME
            if not extracted_name:
                if re.search(r'\b(?:PRODUCT(?:\s*NAME)?|MEDICINE(?:\s*NAME)?|ITEM(?:\s*NAME)?|DRUG(?:\s*NAME)?)\b', upper):
                    val = re.sub(r'^(?:PRODUCT(?:\s*NAME)?|MEDICINE(?:\s*NAME)?|ITEM(?:\s*NAME)?|DRUG(?:\s*NAME)?|NAME)[\s.:;=\-_/]*', '', line, flags=re.IGNORECASE).strip()
                    if val and not is_noise_text(val) and val.upper() not in {'NAME', 'PRODUCT', 'MEDICINE', 'ITEM'}:
                        extracted_name = val
                    else:
                        lookahead = get_lookahead_tokens(i + 1, 3)
                        for candidate in lookahead:
                            if candidate.upper() in {'NAME', 'PRODUCT', 'MEDICINE', 'ITEM'}:
                                continue
                            extracted_name = candidate
                            idx_in_la = lookahead.index(candidate)
                            if idx_in_la + 1 < len(lookahead) and re.search(r'\b(?:mg|ml|tablets?|capsules?)\b', lookahead[idx_in_la + 1], re.IGNORECASE):
                                extracted_name = f"{extracted_name} {lookahead[idx_in_la + 1]}"
                            break

            # 2. SKU / PRODUCT CODE
            if not extracted_sku:
                if re.search(r'\b(?:SKU|ITEM\s*CODE|PRODUCT\s*CODE)\b', upper):
                    val = re.sub(r'^(?:SKU|ITEM\s*CODE|PRODUCT\s*CODE|CODE)[\s.:;=\-_/]*', '', line, flags=re.IGNORECASE).strip()
                    sku_m = re.search(r'([A-Za-z0-9\-_]{3,25})', val)
                    if sku_m and sku_m.group(1).upper() not in {'CODE', 'SKU', 'ITEM', 'PRODUCT'}:
                        extracted_sku = sku_m.group(1)
                    else:
                        lookahead = get_lookahead_tokens(i + 1, 3)
                        for candidate in lookahead:
                            sku_m2 = re.search(r'([A-Za-z0-9\-_]{3,25})', candidate)
                            if sku_m2 and sku_m2.group(1).upper() not in {'CODE', 'SKU', 'ITEM', 'PRODUCT'}:
                                extracted_sku = sku_m2.group(1)
                                break

            # 3. PURCHASE ORDER (PO NUMBER)
            if not extracted_po:
                if re.search(r'\b(?:PURCHASE\s*ORDER|PURCHASE|P\.?O\.?(?:\s*(?:NO|NUMBER|#))?)\b', upper):
                    val = re.sub(r'^(?:PURCHASE\s*ORDER|PURCHASE|P\.?O\.?(?:\s*(?:NO|NUMBER|#))?|ORDER)[\s.:;=\-_/]*', '', line, flags=re.IGNORECASE).strip()
                    val = re.sub(r'^(?:NO|NUMBER|#)[\s.:;=\-_/]*', '', val, flags=re.IGNORECASE).strip()
                    po_m = re.search(r'([A-Za-z0-9\-_]{3,25})', val)
                    if po_m and po_m.group(1).upper() not in {'NO', 'NUMBER', 'ORDER', 'PURCHASE'}:
                        extracted_po = po_m.group(1)
                    else:
                        lookahead = get_lookahead_tokens(i + 1, 3)
                        for candidate in lookahead:
                            if candidate.upper() in {'ORDER', 'NO', 'NUMBER', '#'}:
                                continue
                            po_m2 = re.search(r'([A-Za-z0-9\-_]{3,25})', candidate)
                            if po_m2 and po_m2.group(1).upper() not in {'NO', 'NUMBER', 'ORDER', 'PURCHASE'}:
                                extracted_po = po_m2.group(1)
                                break

            # 4. BATCH / LOT NUMBER
            if not extracted_batch:
                if re.search(r'\b(?:BATCH(?:\s*(?:NO|NUMBER|#))?|B\.?\s*NO|LOT(?:\s*(?:NO|NUMBER|#))?|B\/NO|BN)\b', upper):
                    val = re.sub(r'^(?:BATCH(?:\s*(?:NO|NUMBER|#))?|B\.?\s*NO|LOT(?:\s*(?:NO|NUMBER|#))?|B\/NO|BN)[\s.:;=\-_/]+', '', line, flags=re.IGNORECASE).strip()
                    val = re.sub(r'^(?:NUMBER|NO|NUM|#)[\s.:;=\-_/]*', '', val, flags=re.IGNORECASE).strip()
                    batch_m = re.search(r'([A-Za-z0-9][A-Za-z0-9\-_ /]{2,24})', val)
                    if batch_m and batch_m.group(1).strip().upper() not in {'NUMBER', 'NO', 'NUM', 'LOT', 'BATCH'}:
                        extracted_batch = batch_m.group(1).strip()
                    else:
                        lookahead = get_lookahead_tokens(i + 1, 4)
                        for candidate in lookahead:
                            if candidate.upper() in {'NUMBER', 'NO', 'NUM', '#', 'OF', 'DATE'}:
                                continue
                            batch_m2 = re.search(r'([A-Za-z0-9][A-Za-z0-9\-_ /]{2,24})', candidate)
                            if batch_m2 and batch_m2.group(1).strip().upper() not in {'NUMBER', 'NO', 'NUM', 'LOT', 'BATCH'}:
                                extracted_batch = batch_m2.group(1).strip()
                                break

            # 5. MANUFACTURING DATE (MFG DATE)
            if not extracted_mfg:
                if re.search(r'\b(?:MANUFACTUR(?:ING|E)?(?:\s*DATE)?|MFG(?:\s*DATE)?|MFD|DATE\s*OF\s*MFG)\b', upper):
                    val = re.sub(r'^(?:MANUFACTUR(?:ING|E)?(?:\s*DATE)?|MFG(?:\s*DATE)?|MFD|DATE\s*OF\s*MFG|DATE)[\s.:;=\-_/]*', '', line, flags=re.IGNORECASE).strip()
                    d_m = re.search(cls.DATE_REGEX_STR, val, re.IGNORECASE)
                    if d_m:
                        extracted_mfg = cls.clean_date_str(d_m.group(0))
                    else:
                        lookahead = get_lookahead_tokens(i + 1, 3)
                        for candidate in lookahead:
                            if candidate.upper() in {'DATE', 'DT', 'OF'}:
                                continue
                            d_m2 = re.search(cls.DATE_REGEX_STR, candidate, re.IGNORECASE)
                            if d_m2:
                                extracted_mfg = cls.clean_date_str(d_m2.group(0))
                                break

            # 6. EXPIRY DATE (EXP DATE)
            if not extracted_expiry:
                if re.search(r'\b(?:EXPIR(?:Y|ATION)?(?:\s*DATE)?|EXP(?:\s*DATE)?|USE\s*BY|USE\s*BEFORE)\b', upper):
                    val = re.sub(r'^(?:EXPIR(?:Y|ATION)?(?:\s*DATE)?|EXP(?:\s*DATE)?|USE\s*BY|USE\s*BEFORE|DATE)[\s.:;=\-_/]*', '', line, flags=re.IGNORECASE).strip()
                    d_m = re.search(cls.DATE_REGEX_STR, val, re.IGNORECASE)
                    if d_m:
                        extracted_expiry = cls.clean_date_str(d_m.group(0))
                    else:
                        lookahead = get_lookahead_tokens(i + 1, 3)
                        for candidate in lookahead:
                            if candidate.upper() in {'DATE', 'DT'}:
                                continue
                            d_m2 = re.search(cls.DATE_REGEX_STR, candidate, re.IGNORECASE)
                            if d_m2:
                                extracted_expiry = cls.clean_date_str(d_m2.group(0))
                                break

            # 7. PRICE / MRP / RATE
            if extracted_mrp is None:
                if re.search(r'\b(?:PRICE\s*/\s*MRP|M\.?R\.?P|PRICE|RATE|\bRS\b|INR|₹)\b', upper):
                    val = re.sub(r'^(?:PRICE\s*/\s*MRP|M\.?R\.?P|PRICE|RATE|\bRS\b|INR|₹)[\s.:₹;=\-_/]*', '', line, flags=re.IGNORECASE).strip()
                    val = re.sub(r'^[\/ ]*MRP[\s.:₹;=\-_/]*', '', val, flags=re.IGNORECASE).strip()
                    val = re.sub(r'^(?:\bRS\b\.?|INR|₹)[\s.:;=\-_/]*', '', val, flags=re.IGNORECASE).strip()
                    # Do not match timestamp like 3:03 pm
                    if not re.search(r'\b(?:pm|am|hours|hrs|min)\b', val, re.IGNORECASE):
                        mrp_m = re.search(r'([0-9]+(?:\.[0-9]{1,2})?)', val)
                        if mrp_m:
                            try:
                                extracted_mrp = float(mrp_m.group(1))
                            except ValueError:
                                pass
                    if extracted_mrp is None:
                        lookahead = get_lookahead_tokens(i + 1, 4)
                        for candidate in lookahead:
                            if candidate.upper() in {'/', 'MRP', 'PRICE', 'RATE', 'RS', 'RS.', 'INR', '₹'}:
                                continue
                            if re.search(r'\b(?:pm|am|hours|hrs|min)\b', candidate, re.IGNORECASE):
                                continue
                            cand_clean = re.sub(r'^[^\d.]+', '', candidate).strip()
                            mrp_m2 = re.search(r'([0-9]+(?:\.[0-9]{1,2})?)', cand_clean)
                            if mrp_m2:
                                try:
                                    extracted_mrp = float(mrp_m2.group(1))
                                    break
                                except ValueError:
                                    pass

        # -------------------------------------------------------------
        # PASS 2: Full-Text Global Search Fallback
        # -------------------------------------------------------------
        combined_text = "  ".join(all_lines_text)

        # Medicine Name Fallback
        if not extracted_name:
            for line in all_lines_text:
                if is_noise_text(line):
                    continue
                st_m = cls.STRENGTH_REGEX.search(line)
                if st_m:
                    extracted_name = st_m.group(1).strip()
                    break

            if not extracted_name:
                st_m2 = cls.STRENGTH_REGEX.search(combined_text)
                if st_m2:
                    extracted_name = st_m2.group(1).strip()

        # SKU Fallback
        if not extracted_sku:
            sku_regex = re.compile(r'\b(?:SKU|ITEM\s*CODE)[:\s]+([A-Za-z0-9\-_]{3,20})', re.IGNORECASE)
            sm = sku_regex.search(combined_text)
            if sm and sm.group(1).upper() not in {'CODE', 'SKU'}:
                extracted_sku = sm.group(1)

        # PO Fallback
        if not extracted_po:
            po_regex = re.compile(r'\b(?:PO|PURCHASE\s*ORDER)[\s.:#\-]+([A-Za-z0-9\-_]{3,25})', re.IGNORECASE)
            pm = po_regex.search(combined_text)
            if pm and pm.group(1).upper() not in {'NUMBER', 'NO', 'ORDER', 'PURCHASE'}:
                extracted_po = pm.group(1)

        # Batch Fallback
        if not extracted_batch:
            batch_regex = re.compile(r'\b(?:BTH|BATCH|LOT|B\.NO|B\/NO|BN)(?:\s*(?:NO|NUMBER|#))?[\s.:#\-]+([A-Za-z0-9][A-Za-z0-9\-_ /]{2,24})', re.IGNORECASE)
            bm = batch_regex.search(combined_text)
            if bm and bm.group(1).strip().upper() not in {'NUMBER', 'NO', 'NUM', 'LOT', 'BATCH'}:
                extracted_batch = bm.group(1).strip()

        # Mfg Date Fallback
        if not extracted_mfg:
            mfg_regex = re.compile(r'\b(?:MFG|MFD|MANUFACTUR\w*)[\s.:#\-]+' + f'({cls.DATE_REGEX_STR})', re.IGNORECASE)
            mm = mfg_regex.search(combined_text)
            if mm:
                extracted_mfg = cls.clean_date_str(mm.group(1))

        # Expiry Date Fallback
        if not extracted_expiry:
            exp_regex = re.compile(r'\b(?:EXP|EXPIR\w*|USE\s*BEFORE)[\s.:#\-]+' + f'({cls.DATE_REGEX_STR})', re.IGNORECASE)
            em = exp_regex.search(combined_text)
            if em:
                extracted_expiry = cls.clean_date_str(em.group(1))

        # MRP / Rate Fallback (requires explicit indicator and ignores timestamps)
        if extracted_mrp is None:
            mrp_regex = re.compile(r'\b(?:PRICE\s*/\s*MRP|M\.?R\.?P|PRICE|RATE|\bRS\b|INR)[\s.:₹#\-/]+(?:RS\.?\s*)?([0-9]+(?:\.[0-9]{1,2})?)', re.IGNORECASE)
            mmrp = mrp_regex.search(combined_text)
            if mmrp:
                try:
                    val = float(mmrp.group(1))
                    # Avoid 0 or tiny non-prices
                    if val > 0:
                        extracted_mrp = val
                except ValueError:
                    pass

        # Final Cleanup of Product Name
        if is_noise_text(extracted_name):
            extracted_name = ""

        if not extracted_name:
            for line in all_lines_text:
                if is_noise_text(line):
                    continue
                upper = line.upper()
                if any(w in upper for w in ['PHARMA', 'TABLET', 'CAPSULE', '500MG', '250MG', 'PARACETAMOL']):
                    extracted_name = line
                    break

        return {
            "detected_text": full_text,
            "all_lines": all_lines_text,
            "medicine_name": extracted_name or "Pharmaceutical Item",
            "sku": extracted_sku,
            "po_number": extracted_po,
            "batch_number": extracted_batch,
            "expiry_date": extracted_expiry,
            "mfg_date": extracted_mfg,
            "mrp": extracted_mrp,
            "lines_count": len(all_lines_text),
        }
