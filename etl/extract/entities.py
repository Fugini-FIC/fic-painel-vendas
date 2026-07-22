# extract/entities.py — registro de entidades extraídas do Progress p/ raw.*
# Cada entidade: SQL de extração, tabela raw destino, colunas (na ordem do SELECT),
# se é incremental (janela por dt_emis_nota) ou full.

ENTIDADES = {
    "it_nota_fisc": {
        "sql": "it_nota_fisc.sql",
        "raw_table": "raw.it_nota_fisc",
        "incremental": True,
        "data_col": "dt_emis_nota",  # coluna usada no delete da janela incremental
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
        # EXTENT(2) no Progress: driver retorna "valor;valor" (os 2 elementos
        # sempre iguais, confirmado em amostra) — usar só o 1º elemento.
        "extent_decimal": {"qt_faturada", "qt_devolvida"},
    },
    "natur_oper": {
        "sql": "natur_oper.sql",
        "raw_table": "raw.natur_oper",
        "incremental": False,
        "colunas": ["nat_operacao", "denominacao", "tipo", "cfop", "log_bonif"],
        "texto": {"nat_operacao", "denominacao", "cfop"},
        "int": {"tipo"},
        "bool": {"log_bonif"},
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
    # --- Fase 2a: dimensões cliente e vendedor (base ems2mult) ---
    "emitente": {
        "sql": "emitente.sql",
        "raw_table": "raw.emitente",
        "incremental": False,
        "colunas": ["cod_emitente", "nome_emit", "nome_abrev", "cgc", "cidade", "estado",
                    "cod_rep", "cod_canal_venda", "lim_credito", "ind_cre_cli",
                    "ind_sit_emitente", "dt_ult_venda", "identific"],
        "texto": {"cod_emitente", "nome_emit", "nome_abrev", "cgc", "cidade", "estado",
                  "cod_rep", "cod_canal_venda"},
        "int": {"ind_cre_cli", "ind_sit_emitente", "identific"},
    },
    "repres": {
        "sql": "repres.sql",
        "raw_table": "raw.repres",
        "incremental": False,
        "colunas": ["cod_rep", "nome", "nome_abrev", "nome_ab_reg", "rep_indireto",
                    "dt_deslig", "ind_situacao"],
        "texto": {"cod_rep", "nome", "nome_abrev", "nome_ab_reg", "rep_indireto"},
        "int": {"ind_situacao"},
    },
    # --- Piloto: 5 vendedores (6003-6007) — pedidos e cadastros ---
    "pedidos": {
        "sql": "pedidos.sql",
        "raw_table": "raw.pedidos",
        "incremental": True,
        "data_col": "dt_venda",
        "colunas": ["nome_abrev", "nr_pedcli", "cod_emitente", "nr_sequencia", "it_codigo",
                    "descricao_1", "descricao_2", "qt_pedida", "preco_venda", "valor_total_venda",
                    "dt_venda", "representante", "situacao_pedido"],
        "texto": {"nome_abrev", "nr_pedcli", "cod_emitente", "it_codigo",
                  "descricao_1", "descricao_2", "representante"},
        "int": {"nr_sequencia", "situacao_pedido"},
    },
    "cadastros": {
        "sql": "cadastros.sql",
        "raw_table": "raw.cadastros",
        "incremental": False,
        "colunas": ["tmp_emitente", "cod_emitente", "nome_emit", "cidade", "estado", "cgc_cpf",
                    "telefone", "email", "cod_rep", "nome_abrev", "id_status", "desc_status",
                    "canal_distribuicao", "dt_implantacao", "dt_impl_web", "dt_efetiva_coml",
                    "lim_credito", "vlr_credito_sugerido"],
        "texto": {"cod_emitente", "nome_emit", "cidade", "estado", "cgc_cpf", "telefone",
                  "email", "cod_rep", "nome_abrev", "desc_status", "canal_distribuicao"},
        "int": {"tmp_emitente", "id_status"},
    },
}
