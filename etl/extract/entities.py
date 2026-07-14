# extract/entities.py — registro de entidades extraídas do Progress p/ raw.*
# Cada entidade: SQL de extração, tabela raw destino, colunas (na ordem do SELECT),
# se é incremental (janela por dt_emis_nota) ou full.

ENTIDADES = {
    "it_nota_fisc": {
        "sql": "it_nota_fisc.sql",
        "raw_table": "raw.it_nota_fisc",
        "incremental": True,
        "colunas": [
            "cod_estabel", "serie", "nr_nota_fis", "nr_seq_fat", "it_codigo",
            "nat_operacao", "qt_faturada", "un_fatur", "vl_merc_liq", "vl_tot_item",
            "qt_devolvida", "cd_emitente", "cd_vendedor", "nome_ab_cli", "nr_pedcli",
            "dt_emis_nota", "dt_cancela", "ind_sit_nota",
        ],
        # colunas de texto que precisam de trim + latin-1
        "texto": {"cod_estabel", "serie", "nr_nota_fis", "it_codigo", "nat_operacao",
                  "un_fatur", "cd_emitente", "cd_vendedor", "nome_ab_cli", "nr_pedcli"},
        "int": {"nr_seq_fat", "ind_sit_nota"},
    },
    "natur_oper": {
        "sql": "natur_oper.sql",
        "raw_table": "raw.natur_oper",
        "incremental": False,
        "colunas": ["nat_operacao", "denominacao", "tipo", "cfop"],
        "texto": {"nat_operacao", "denominacao", "cfop"},
        "int": {"tipo"},
    },
    "item": {
        "sql": "item.sql",
        "raw_table": "raw.item",
        "incremental": False,
        "colunas": ["it_codigo", "desc_item", "fm_codigo", "fm_cod_com", "ge_codigo", "un"],
        "texto": {"it_codigo", "desc_item", "fm_codigo", "fm_cod_com", "ge_codigo", "un"},
        "int": set(),
    },
    "fam_comerc": {
        "sql": "fam_comerc.sql",
        "raw_table": "raw.fam_comerc",
        "incremental": False,
        "colunas": ["fm_cod_com", "descricao"],
        "texto": {"fm_cod_com", "descricao"},
        "int": set(),
    },
}
