"""Initial database schema

Revision ID: 001
Revises:
Create Date: 2025-01-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create matches table
    op.create_table(
        'matches',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('sport_key', sa.String(64), nullable=False),
        sa.Column('league_name', sa.String(128), nullable=False),
        sa.Column('home_team', sa.String(128), nullable=False),
        sa.Column('away_team', sa.String(128), nullable=False),
        sa.Column('commence_time', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_index('idx_matches_sport_key', 'matches', ['sport_key'])
    op.create_index('idx_matches_commence_time', 'matches', ['commence_time'])
    op.create_index('idx_match_sport_commence', 'matches', ['sport_key', 'commence_time'])

    # Create odds_snapshots table
    op.create_table(
        'odds_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('match_id', sa.String(64), sa.ForeignKey('matches.id', ondelete='CASCADE'), nullable=False),
        sa.Column('bookmaker', sa.String(64), nullable=False, server_default='pinnacle'),
        sa.Column('home_odds', sa.Float(), nullable=True),
        sa.Column('draw_odds', sa.Float(), nullable=True),
        sa.Column('away_odds', sa.Float(), nullable=True),
        sa.Column('fetched_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('last_update', sa.DateTime(), nullable=True),
    )

    op.create_index('idx_odds_match_fetched', 'odds_snapshots', ['match_id', 'fetched_at'])
    op.create_index('idx_odds_bookmaker', 'odds_snapshots', ['bookmaker'])
    op.create_index('idx_odds_fetched_at', 'odds_snapshots', ['fetched_at'])


def downgrade() -> None:
    op.drop_table('odds_snapshots')
    op.drop_table('matches')
