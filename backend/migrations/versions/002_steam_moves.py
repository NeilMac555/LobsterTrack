"""Add steam_moves table for tracking late line movements

Revision ID: 002
Revises: 001
Create Date: 2025-01-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create steam_moves table
    op.create_table(
        'steam_moves',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('match_id', sa.String(64), sa.ForeignKey('matches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sport_key', sa.String(64), nullable=False),
        sa.Column('outcome', sa.String(16), nullable=False),  # home, draw, away
        sa.Column('team_name', sa.String(128), nullable=False),
        sa.Column('opening_odds', sa.Float(), nullable=False),
        sa.Column('previous_odds', sa.Float(), nullable=False),
        sa.Column('current_odds', sa.Float(), nullable=False),
        sa.Column('movement_percent', sa.Float(), nullable=False),
        sa.Column('detected_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('match_commence_time', sa.DateTime(), nullable=False),
        sa.Column('minutes_before_kickoff', sa.Integer(), nullable=False),
        sa.Column('result_updated', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('won', sa.Boolean(), nullable=True),
        sa.Column('home_score', sa.Integer(), nullable=True),
        sa.Column('away_score', sa.Integer(), nullable=True),
    )

    op.create_index('idx_steam_match_id', 'steam_moves', ['match_id'])
    op.create_index('idx_steam_sport_key', 'steam_moves', ['sport_key'])
    op.create_index('idx_steam_detected_at', 'steam_moves', ['detected_at'])
    op.create_index('idx_steam_outcome', 'steam_moves', ['outcome'])
    op.create_index('idx_steam_result_updated', 'steam_moves', ['result_updated'])


def downgrade() -> None:
    op.drop_table('steam_moves')
