import { defineComponent, h } from 'vue';

export const IconCamera = defineComponent({
  name: 'IconCamera',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M864 192H736L672 128H352l-64 64H160c-35.3 0-64 28.7-64 64v512c0 35.3 28.7 64 64 64h704c35.3 0 64-28.7 64-64V256c0-35.3-28.7-64-64-64zM512 704c-106 0-192-86-192-192s86-192 192-192 192 86 192 192-86 192-192 192zm0-320c-70.7 0-128 57.3-128 128s57.3 128 128 128 128-57.3 128-128-57.3-128-128-128z", "fillRule": "evenodd"})
      ]
    );
  }
});
