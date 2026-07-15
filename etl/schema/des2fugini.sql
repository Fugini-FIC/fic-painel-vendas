-- PUB.familia_per_item definição

-- Drop table

-- DROP TABLE PUB.familia_per_item;

CREATE TABLE PUB.familia_per_item (
	cod_familia integer DEFAULT 0,
	desc_familia varchar(60),
	perc_premio numeric(17,2) DEFAULT 0,
	char_1 varchar(16),
	int_1 integer DEFAULT 0,
	dec_1 numeric(17,2) DEFAULT 0,
	log_1 bit DEFAULT 0,
	ano_ref integer DEFAULT 0,
	mes_ref integer DEFAULT 0,
	peso_fam numeric(20,5) DEFAULT 0,
	peso_camp varchar(140) DEFAULT '0',
	CONSTRAINT i1 PRIMARY KEY (cod_familia,ano_ref,mes_ref)
);
CREATE INDEX i2 ON PUB.familia_per_item (ano_ref,mes_ref,cod_familia);


-- PUB.familia_produto_param definição

-- Drop table

-- DROP TABLE PUB.familia_produto_param;

CREATE TABLE PUB.familia_produto_param (
	ano_camp integer DEFAULT 0,
	mes_camp integer DEFAULT 0,
	ano_aval_1 integer DEFAULT 0,
	ano_aval_2 integer DEFAULT 0,
	ano_aval_3 integer DEFAULT 0,
	mes_aval_1 integer DEFAULT 0,
	mes_aval_2 integer DEFAULT 0,
	mes_aval_3 integer DEFAULT 0,
	tab_preco varchar(30),
	valid_ini date DEFAULT NULL,
	valid_fim date DEFAULT NULL,
	repres_ini integer DEFAULT 0,
	repres_fim integer DEFAULT 0,
	data_calc timestamp DEFAULT NULL,
	char_1 varchar(16),
	int_1 integer DEFAULT 0,
	dec_1 numeric(17,2) DEFAULT 0,
	log_1 bit DEFAULT 1,
	data_com_ini date DEFAULT NULL,
	data_com_fim date DEFAULT NULL,
	perc_cresc numeric(17,2) DEFAULT 0,
	perc_camp_fat_fug numeric(17,2) DEFAULT 0,
	perc_camp_fat_crs numeric(17,2) DEFAULT 0,
	perc_camp_tonelagem numeric(17,2) DEFAULT 0,
	perc_preco_medio numeric(17,2) DEFAULT 0,
	perc_preco_devol numeric(17,2) DEFAULT 0,
	calculo_habilitado bit DEFAULT 1,
	preco_med_tonel varchar(44) DEFAULT '0',
	preco_med_caixa varchar(44) DEFAULT '0',
	premio_financ bit DEFAULT 1,
	premio_med_caixa bit DEFAULT 1,
	premio_med_tonel bit DEFAULT 1,
	dia_faseamento integer DEFAULT 0,
	perc_faseamento numeric(17,2) DEFAULT 0,
	perc_premio_fase numeric(17,2) DEFAULT 0,
	dt_fim_qua_sem date DEFAULT NULL,
	dt_fim_qui_sem date DEFAULT NULL,
	dt_fim_pri_sem date DEFAULT NULL,
	dt_fim_seg_sem date DEFAULT NULL,
	dt_fim_ter_sem date DEFAULT NULL,
	obj_qua_sem numeric(17,2) DEFAULT 0,
	obj_qui_sem numeric(17,2) DEFAULT 0,
	obj_pri_sem numeric(17,2) DEFAULT 0,
	obj_seg_sem numeric(17,2) DEFAULT 0,
	obj_ter_sem numeric(17,2) DEFAULT 0,
	camp_exced_valor bit DEFAULT 0,
	camp_exced_caixa bit DEFAULT 0,
	totaliz_obj bit DEFAULT 1,
	perc_posit_clt numeric(17,2) DEFAULT 0,
	perc_posit_erc numeric(17,2) DEFAULT 0,
	gat_caixa_clt numeric(17,2) DEFAULT 0,
	gat_caixa_erc numeric(17,2) DEFAULT 0,
	CONSTRAINT i1 PRIMARY KEY (ano_camp,mes_camp)
);


-- PUB.item_per_familia definição

-- Drop table

-- DROP TABLE PUB.item_per_familia;

CREATE TABLE PUB.item_per_familia (
	cod_familia integer DEFAULT 0,
	"it-codigo" varchar(32),
	preco_tabela numeric(17,2) DEFAULT 0,
	char_1 varchar(16),
	int_1 integer DEFAULT 0,
	dec_1 numeric(17,2) DEFAULT 0,
	log_1 bit DEFAULT 0,
	ano_ref integer DEFAULT 0,
	mes_ref integer DEFAULT 0,
	prd_foco bit DEFAULT 0,
	contab_camp bit DEFAULT 1,
	CONSTRAINT i1 PRIMARY KEY ("it-codigo",ano_ref,mes_ref)
);
CREATE INDEX i2 ON PUB.item_per_familia (cod_familia,"it-codigo",ano_ref,mes_ref);
CREATE INDEX i3 ON PUB.item_per_familia (ano_ref,mes_ref,"it-codigo");