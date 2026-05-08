import React from 'react';
export const IconBox = props => (
  <svg viewBox="0 0 20 20"  {...props} className={`tiangong-icons ${props.className ? props.className : ''}`}><path d="M832 128H192c-35.3 0-64 28.7-64 64v128h768V192c0-35.3-28.7-64-64-64zM128 384v448c0 35.3 28.7 64 64 64h640c35.3 0 64-28.7 64-64V384H128zm448 256H448v-128h128v128z" fillRule="evenodd" /></svg>
);
