# extract/csv_entities.py — registro das entidades lidas dos CSVs do TOTVS/portal.
# Fonte: pasta CSV_DIR (o .bat da Fugini copia de \\192.168.0.226\pdi para cá).
# Ler CSV = ZERO impacto no ERP produtivo (o export roda no ERP em horário
# controlado). Encoding latin-1, separador ';', decimal vírgula, datas DD/MM/AA.
#
# Cada coluna: (nome_no_csv, nome_no_raw, tipo) — tipo em {text,num,int,date}.
import os

CSV_DIR = os.environ.get("CSV_DIR", r"C:\pdi\in\full")

CSV_ENTIDADES = {
    "nf": {
        "arquivo": "totvs_itensnotafiscal.csv",
        "raw_table": "raw_csv.nf",
        "filtro_data": "data_emissao",   # corta histórico anterior a CSV_DESDE
        "colunas": [
            ("cod-item",       "it_codigo",    "text"),
            ("nr-nota-fiscal", "nr_nota",      "text"),
            ("qt-cxs-nf",      "qt_caixas",    "num"),
            ("valor-item-nf",  "valor",        "num"),
            ("cod-cliente",    "cod_cliente",  "text"),
            ("data-emissao",   "data_emissao", "date"),
            ("nr-ped",         "nr_pedido",    "text"),
            ("estabel",        "estabel",      "text"),
            ("vl-bru-it",      "vl_bruto",     "num"),
            ("cod-rep",        "cod_vendedor", "text"),
            ("vlr-desc",       "vl_desconto",  "num"),
        ],
    },
    "cliente": {
        "arquivo": "totvs_cliente.csv",
        "raw_table": "raw_csv.cliente",
        "colunas": [
            ("cod-cliente",    "cod_cliente", "text"),
            ("cod-erc",        "cod_erc",     "text"),   # representante (código)
            ("nome-cliente",   "nome",        "text"),
            ("status-cliente", "status",      "text"),   # Ativo/Inativo (cadastral)
            ("canal",          "canal",       "text"),   # nome do canal (ex: FOODSERVICE)
            ("cnpj",           "cnpj",        "text"),
            ("limite-disp",    "limite_disp", "num"),
            ("NomERC",         "nome_erc",    "text"),   # nome do representante
        ],
    },
    "produto": {
        "arquivo": "totvs_produto.csv",
        "raw_table": "raw_csv.produto",
        "colunas": [
            ("cod-item",          "it_codigo",  "text"),
            ("descricao-item",    "descricao",  "text"),
            ("familia-comercial", "familia",    "text"),  # nome da família
        ],
    },
    "pedido": {
        "arquivo": "totvs_itenspedido.csv",
        "raw_table": "raw_csv.pedido",
        "filtro_data": "data_pedido",    # corta histórico anterior a CSV_DESDE
        "colunas": [
            ("cod-item",           "it_codigo",   "text"),
            ("nr-pedido",          "nr_pedido",   "text"),
            ("qt-cxs-pedido",      "qt_caixas",   "num"),
            ("valor-item-pedido",  "valor",       "num"),
            ("cod-cliente",        "cod_cliente", "text"),
            ("status-item",        "status_item", "text"),  # "Carteira" = em aberto
            ("tipo",               "tipo",        "text"),  # Venda / Bonificacao...
            ("data-pedido",        "data_pedido", "date"),
            ("campanha",           "campanha",    "text"),
        ],
    },
}
