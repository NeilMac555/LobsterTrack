"""Add closing_lines table for storing last pre-kickoff odds

Revision ID: 003
Revises: 002
Create Date: 2026-02-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'closing_lines',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('match_id', sa.String(64), sa.ForeignKey('matches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('league', sa.String(64), nullable=False),
        sa.Column('home_team', sa.String(128), nullable=False),
        sa.Column('away_team', sa.String(128), nullable=False),
        sa.Column('kickoff_time', sa.DateTime(), nullable=False),
        sa.Column('market_type', sa.Enum('1x2', 'asian_handicap', 'totals', name='markettype'), nullable=False),
        sa.Column('close_home', sa.Float(), nullable=True),
        sa.Column('close_draw', sa.Float(), nullable=True),
        sa.Column('close_away', sa.Float(), nullable=True),
        sa.Column('close_line', sa.Float(), nullable=True),
        sa.Column('close_home_price', sa.Float(), nullable=True),
        sa.Column('close_away_price', sa.Float(), nullable=True),
        sa.Column('close_over_price', sa.Float(), nullable=True),
        sa.Column('close_under_price', sa.Float(), nullable=True),
        sa.Column('captured_at', sa.DateTime(), nullable=False),
        sa.Column('minutes_before_kickoff', sa.Integer(), nullable=False),
    )

    op.create_index('idx_closing_match_market', 'closing_lines', ['match_id', 'market_type'], unique=True)
    op.create_index('idx_closing_league', 'closing_lines', ['league'])
    op.create_index('idx_closing_kickoff', 'closing_lines', ['kickoff_time'])
    op.create_index('idx_closing_market_type', 'closing_lines', ['market_type'])


def downgrade() -> None:
    op.drop_table('closing_lines')
    op.execute("DROP TYPE IF EXISTS markettype")
